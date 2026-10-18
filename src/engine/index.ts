import {
  categoryById,
  categoryByKey as bridgeCategoryByKey,
} from "../domain/categories";
import {
  ModeRuntime,
  categoryEffect,
  blend,
  type ModeEffect,
  type ModeSnapshot,
} from "./modes";
import { eventOccurrences } from "./events";
import { TransferRuntime } from "./transfers";
import { monthlyIncome, annualFrequency } from "./incomes";
import {
  budgetInflationFactor,
  chargeInflationFactor,
  completedMonths,
  inflationFactor,
} from "./inflation";
import { taxEstimate, taxDue } from "./taxes";
import type {
  Account,
  LedgerAccount,
  Assumptions,
  CountryMerchantReference,
  PersonaConfig,
  PlannedEvent,
} from "../domain/types";
import {
  effectivePaymentCards,
  selectedPaymentCard,
  ledgerAccounts,
  paymentCardAccountKey,
} from "../config/payment-cards";
import {
  cardBillingDue,
  cardRepaymentDue,
  cardRepaymentMinor,
} from "./payment-cards";
import { canonicalJson, referenceHash } from "../config/canonical";
import { ConfigurationError, validateScenario } from "../config/validation";
import {
  addDays,
  addMonths,
  dates,
  daysInMonth,
  differenceDays,
  elapsedYears,
  makeDate,
  nextWeekday,
  parts,
  stamp,
  weekday,
} from "./calendar";
import {
  categories,
  merchantRates,
  monthlyEnvelopes,
  seasonalFactors,
  type HouseholdState,
  type MerchantRate,
} from "./consumption";
import { scheduleIncomes } from "./incomes";
import { planHabits } from "./habits";
import { createLoan, facilityLoan, replacesHousing } from "./loans";
import { fromMinor, toMinor } from "./money";
import { boundedBasket, hash, random, weightedIndex } from "./random";
import { planTrip } from "./travel";
import type {
  AuditEntry,
  DailyBalance,
  Loan,
  SimulationKind,
  SimulationResult,
  Transaction,
} from "./types";

export * from "./types";
export {
  monthlyEnvelopes,
  merchantRates,
  seasonalFactors,
} from "./consumption";
export { monthlyIncome, annualFrequency } from "./incomes";
export { addDays, addMonths } from "./calendar";
export const ENGINE_VERSION = "personai.deterministic.v2.0.0";

/** Display labels do not participate in financial identity. Merchant names do: affinity and transport gates use them. */
function financialConfig(config: PersonaConfig): unknown {
  const {
    name: _name,
    accounts,
    charges,
    incomes,
    plannedEvents,
    creditFacilities,
    accountTransfers,
    spendingModes,
    paymentCards: _paymentCards,
    defaultPaymentCardId: _defaultPaymentCardId,
    countryCode: _country,
    region: _region,
    urbanity: _urbanity,
    family: _family,
    riskProfile: _risk,
    bankFees: _bankFees,
    displayCurrency: _displayCurrency,
    locationDescription: _location,
    ...rest
  } = config;
  return {
    ...rest,
    paymentCards: effectivePaymentCards(config).map(
      ({ label: _label, ...card }) => card,
    ),
    defaultPaymentCardId:
      config.defaultPaymentCardId ?? effectivePaymentCards(config)[0]?.id,
    ...(accountTransfers?.length
      ? {
          accountTransfers: accountTransfers.map(
            ({ label: _l, ...rule }) => rule,
          ),
        }
      : {}),
    ...(spendingModes?.length
      ? { spendingModes: spendingModes.map(({ label: _l, ...mode }) => mode) }
      : {}),
    accounts: accounts.map(({ name: _n, bank: _b, ...a }) => a),
    charges: charges.map(({ name: _n, ...c }) => c),
    incomes: incomes.map(({ label: _l, ...i }) => i),
    plannedEvents: plannedEvents.map(({ label: _l, recurrence, ...e }) => ({
      ...e,
      ...(recurrence && recurrence !== "once" ? { recurrence } : {}),
    })),
    ...(creditFacilities?.length
      ? {
          creditFacilities: creditFacilities.map(
            ({ label: _l, ...loan }) => loan,
          ),
        }
      : {}),
  };
}
function financialCalibration(value: unknown): unknown {
  const displayKeys = new Set([
    "name",
    "description",
    "title",
    "note",
    "url",
    "finding",
    "assumption",
    "summary",
    "sources",
    "source",
    "calendarMonths",
  ]);
  if (Array.isArray(value)) return value.map(financialCalibration);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !displayKeys.has(key))
        .map(([key, item]) => [key, financialCalibration(item)]),
    );
  return value;
}
export function financialFingerprint(
  config: PersonaConfig,
  reference: CountryMerchantReference,
  assumptions?: Assumptions,
): string {
  const {
    name: _name,
    sources: _sources,
    regions,
    ...financialReference
  } = reference;
  const calibration = assumptions
    ? {
        consumption: assumptions.consumption,
        seasonality: assumptions.seasonality,
        consumptionCountry: assumptions.consumptionCountry,
        seasonalityCountry: assumptions.seasonalityCountry,
      }
    : null;
  const text = canonicalJson({
    engineVersion: ENGINE_VERSION,
    config: financialConfig(config),
    reference: {
      ...financialReference,
      regions: regions.map(({ name: _n, ...r }) => r),
    },
    calibration: financialCalibration(calibration),
  });
  return `p1-${hash(text).toString(16).padStart(8, "0")}-${hash(`secondary|${text}`).toString(16).padStart(8, "0")}`;
}

interface PostingOptions {
  paymentCardId?: string;
  category?: string;
  categoryId?: number;
  kind: SimulationKind;
  card?: boolean;
  eventId?: string;
  incomeId?: string;
  loanId?: string;
  merchantId?: number;
  transferId?: string;
  transferRuleId?: string;
  fx?: Transaction["fx"];
  principal?: number;
  interest?: number;
}
interface ExpenseOptions extends PostingOptions {
  protected?: boolean;
  allowCredit?: boolean;
  eventScope?: boolean;
  mortgage?: PlannedEvent;
  funded?: boolean;
  mandatory?: boolean;
}
interface SavingsState {
  accrued: number;
  fortnightBase: number | null;
}
interface RecurringEventCharge {
  eventId: string;
  start: string;
  day: number;
  amountMinor: number;
  label: string;
  category: string;
  categoryId: number;
}

/** Pure generation: no wall clock, external IO or unseeded randomness. All posting arithmetic uses integer minor units. */
export function generate(
  input: PersonaConfig,
  inputReference: CountryMerchantReference,
  inputAssumptions?: Assumptions,
): SimulationResult {
  const config = structuredClone(input),
    reference = structuredClone(inputReference),
    assumptions = inputAssumptions
      ? structuredClone(inputAssumptions)
      : undefined;
  const issues = validateScenario(config, reference, assumptions);
  if (issues.length) throw new ConfigurationError(issues);
  if (config.accounts.filter((a) => a.type === "checking").length !== 1)
    throw new Error("Exactly one current account is required.");
  if (!Number.isInteger(config.years) || config.years < 1 || config.years > 20)
    throw new Error("Simulation duration must be 1–20 whole years.");
  if (!Number.isFinite(Date.parse(`${config.startDate}T00:00:00Z`)))
    throw new Error("A valid start date is required.");
  if (config.referenceId !== reference.id)
    throw new Error("Scenario and merchant reference context must match.");
  const digits = config.currencyDigits,
    minor = (n: number) => toMinor(n, digits),
    major = (n: number) => fromMinor(n, digits);
  const endExclusive = addMonths(config.startDate, config.years * 12),
    endDate = addDays(endExclusive, -1);
  const checking = config.accounts.find((a) => a.type === "checking")!;
  const cards = effectivePaymentCards(config);
  const purchaseCard = selectedPaymentCard(config);
  const allAccounts = ledgerAccounts(config);
  const cardAccounts = allAccounts.filter(
    (a) => a.type === "deferred-card" || a.type === "credit-card",
  );
  const cardOverdraft = new Map(
    cards.map((card) => [card.id, { debt: 0, accrued: 0 }]),
  );
  const balances = Object.fromEntries(
    allAccounts.map((a) => [a.key, minor(a.openingBalance)]),
  );
  const cardDebt = () =>
    cardAccounts.reduce((sum, a) => sum + Math.max(0, -balances[a.key]), 0);
  const idBase = 10_000_000 + (hash(config.id) % 10_000_000) * 10;
  const ids = Object.fromEntries(
    allAccounts.map((a, i) => [a.key, idBase + i]),
  );
  const savings = config.accounts.filter((a) => a.type !== "checking");
  const interestState = Object.fromEntries(
    savings.map((a) => [
      a.key,
      { accrued: 0, fortnightBase: null } as SavingsState,
    ]),
  );
  const ranked = (field: "withdrawalRank" | "depositRank") =>
    savings
      .filter((a) => (a[field] ?? 0) > 0)
      .sort(
        (a, b) =>
          (a[field] ?? 0) - (b[field] ?? 0) || a.key.localeCompare(b.key),
      );
  const withdrawal = ranked("withdrawalRank"),
    deposits = ranked("depositRank");
  const transactions: Transaction[] = [],
    loans: Loan[] = [],
    dailyBalances: DailyBalance[] = [],
    audit: AuditEntry[] = [];
  const events = eventOccurrences(config.plannedEvents, endExclusive);
  const byDay = new Map<string, PlannedEvent[]>();
  for (const event of events)
    byDay.set(event.startDate, [...(byDay.get(event.startDate) ?? []), event]);
  const trips = events
    .filter((e) => e.type.startsWith("travel-"))
    .map((e) => planTrip(config, reference, e));
  const tripPostings = new Map<string, (typeof trips)[number]["postings"]>();
  for (const trip of trips)
    for (const p of trip.postings)
      tripPostings.set(p.date, [...(tripPostings.get(p.date) ?? []), p]);
  const incomes = scheduleIncomes(config, endExclusive, events),
    habits = planHabits(config, reference, endDate, assumptions);
  const rng = random(config.seed);
  const categoryByKey = Object.fromEntries(categories.map((c) => [c.key, c]));
  let date = config.startDate,
    transactionId = 100_000_000,
    transferNumber = 0,
    reserved = 0,
    lastIncomeDate = "";
  let state: HouseholdState = {
    household: config.household,
    eligibleChildren: config.children,
    car: config.car,
    prices: {},
  };
  let housing = config.housing,
    replacedHousing = false;
  const charges = structuredClone(config.charges),
    recurring: RecurringEventCharge[] = [];
  const chargeOrigins = new Map(charges.map((c) => [c.id, config.startDate]));
  const chargeAmount = (charge: (typeof charges)[number], onDate: string) =>
    charge.amount *
    chargeInflationFactor(
      config,
      charge.id,
      onDate,
      chargeOrigins.get(charge.id),
    );
  const recurringAmount = (charge: RecurringEventCharge, onDate: string) =>
    Math.round(
      charge.amountMinor *
        inflationFactor(config.inflation, onDate, charge.start),
    );
  const nextChargeDate = (chargeDay: number) => {
    const [year, month] = parts(date);
    const due = makeDate(year, month, chargeDay);
    return due > date ? due : makeDate(year, month + 1, chargeDay);
  };
  let targets: Record<string, number> = {},
    remaining: Record<string, number> = {},
    rates: MerchantRate[] = [],
    ratesByCategory: Record<string, MerchantRate[]> = {};
  let previousMonth = "";
  const overdraftLimit = config.overdraft ? minor(config.overdraftLimit) : 0;
  const available = () => balances[checking.key] - reserved;
  const modeRuntime = new ModeRuntime(
    config.spendingModes ?? [],
    config.startDate,
  );
  const transferRuntime = new TransferRuntime(config.accountTransfers ?? []);
  let modeEffect: ModeEffect | undefined;
  const modeHistory: SimulationResult["modeHistory"] = [];
  const activity = new Map<
    string,
    {
      income: number;
      expenses: number;
      discretionary: number;
      categories: Record<string, number>;
      saved: number;
      repaid: number;
    }
  >();
  const monthActivity = () => {
    const key = date.slice(0, 7);
    if (!activity.has(key))
      activity.set(key, {
        income: 0,
        expenses: 0,
        discretionary: 0,
        categories: {},
        saved: 0,
        repaid: 0,
      });
    return activity.get(key)!;
  };
  const incomeBaseline = monthlyIncome(config.incomes);
  const baseEnvelopes = monthlyEnvelopes(config, reference, assumptions);
  const expenseBaseline =
    Object.values(baseEnvelopes).reduce((a, b) => a + b, 0) +
    config.charges.filter((c) => c.enabled).reduce((a, c) => a + c.amount, 0);
  const discretionaryBaseline = categories
    .filter((c) => !c.protected)
    .reduce((a, c) => a + (baseEnvelopes[c.key] ?? 0), 0);
  const salaryDates = [...incomes.entries()]
    .filter(([, ps]) =>
      ps.some(
        (p) => p.income.kind === "salary" || (!p.income.kind && p.income.main),
      ),
    )
    .map(([d]) => d)
    .sort();
  let wealthPeak = -Infinity,
    modeWithdrawalKey = "";
  const withdrawalAllowances = new Map<string, number>();
  const cancelledTrips = new Set<string>();
  const essential = (options: ExpenseOptions) =>
    options.protected ||
    categoryByKey[options.category ?? ""]?.protected ||
    options.mandatory;
  const mandatory = (options: ExpenseOptions) =>
    options.mandatory ||
    options.funded ||
    ["recurring", "tax", "credit-repayment", "credit-insurance"].includes(
      options.kind,
    );
  function eligibleWithdrawals(options: ExpenseOptions): Account[] {
    if (!modeEffect) return config.autoSavings ? withdrawal : [];
    const { mode, daysActive } = modeEffect;
    if (
      mode.savingsRules.withdrawals === "never" ||
      (mode.savingsRules.withdrawals === "essentials" &&
        !essential(options) &&
        !mandatory(options))
    )
      return [];
    return withdrawal.filter(
      (a) =>
        a.type === "savings" ||
        (mode.investmentRules.withdrawAfterDays !== null &&
          daysActive >= mode.investmentRules.withdrawAfterDays),
    );
  }
  function canAfford(amount: number, options: ExpenseOptions): boolean {
    if (!modeEffect || mandatory(options)) return true;
    if (
      options.card &&
      purchaseCard.type === "credit" &&
      modeEffect.mode.debtRules.allowBorrowing
    )
      return true;
    const cash =
      available() +
      (modeEffect.mode.debtRules.allowOverdraft
        ? options.card
          ? minor(purchaseCard.authorizedOverdraft)
          : overdraftLimit
        : 0) -
      (essential(options)
        ? 0
        : minor(modeEffect.mode.liquidityTarget) * modeEffect.strength);
    const saved = Math.min(
      withdrawalAllowances.get(modeWithdrawalKey) ?? 0,
      eligibleWithdrawals(options).reduce(
        (sum, a) => sum + Math.max(0, balances[a.key]),
        0,
      ),
    );
    const credit =
      modeEffect.mode.debtRules.allowBorrowing &&
      options.allowCredit !== false &&
      (options.eventScope ||
        ["all", "current", "events-and-current"].includes(
          config.financing.scope,
        ))
        ? (["consumer", "card"] as const).reduce(
            (sum, type) =>
              sum +
              (config.financing[
                type === "consumer" ? "consumerEnabled" : "cardEnabled"
              ]
                ? Math.max(
                    0,
                    minor(
                      config.financing[
                        type === "consumer" ? "consumerLimit" : "cardLimit"
                      ],
                    ) -
                      loans
                        .filter((l) => l.type === type)
                        .reduce((a, l) => a + l.outstandingPrincipalMinor, 0),
                  )
                : 0),
            0,
          )
        : 0;
    const mortgage =
      options.mortgage?.mortgageEnabled &&
      modeEffect.mode.debtRules.allowBorrowing
        ? minor(options.mortgage.mortgagePrincipal)
        : 0;
    return amount <= cash + saved + credit + mortgage;
  }
  function expectedMonthlyIncome(): number {
    const salaryChange = events
      .filter(
        (e) =>
          e.type === "durable-change" &&
          e.change.kind === "salary" &&
          e.startDate <= date,
      )
      .at(-1);
    return config.incomes
      .filter(
        (i) =>
          i.enabled &&
          (!i.startDate || i.startDate <= date) &&
          (!i.endDate || i.endDate >= date),
      )
      .reduce((sum, i) => {
        const base =
          i.main && salaryChange
            ? salaryChange.change.salary
            : (i.amount * annualFrequency(i.frequency)) / 12;
        const retained = events
          .filter(
            (e) =>
              e.type === "income-gap" &&
              e.startDate <= date &&
              addDays(e.startDate, e.durationDays) > date &&
              (i.main || e.incomeScope === "all"),
          )
          .reduce((r, e) => Math.min(r, e.incomeRemainingPercent / 100), 1);
        return (
          sum +
          base *
            retained *
            (1 + i.annualGrowth / 100) **
              elapsedYears(date, salaryChange?.startDate ?? config.startDate)
        );
      }, 0);
  }
  function modeSnapshot(): ModeSnapshot {
    const obligationMonthly =
      (config.incomeTax?.enabled
        ? taxEstimate(config, reference.taxSystem, parts(date)[0]).annualTax /
          12
        : 0) +
      (config.otherTaxes ?? [])
        .filter((t) => t.enabled)
        .reduce(
          (sum, t) =>
            sum +
            t.amount *
              (t.frequency === "monthly"
                ? 1
                : t.frequency === "quarterly"
                  ? 1 / 3
                  : 1 / 12),
          0,
        ) +
      loans
        .filter((l) => l.outstandingPrincipalMinor > 0)
        .reduce((sum, l) => sum + l.installment + l.insurance, 0) +
      cards
        .filter((card) => card.type !== "debit")
        .reduce((sum, card) => {
          const outstanding = Math.max(
            0,
            -balances[paymentCardAccountKey(card.id)],
          );
          const annualPayments =
            card.type === "deferred-debit"
              ? 12
              : { weekly: 365.2425 / 7, monthly: 12, quarterly: 4, annual: 1 }[
                  card.repaymentFrequency
                ];
          return (
            sum +
            (major(cardRepaymentMinor(card, outstanding, digits)) *
              annualPayments) /
              12
          );
        }, 0);
    const expenseCoverage = expenseBaseline + obligationMonthly;
    const current = monthActivity(),
      completed = [...activity.entries()]
        .filter(([month]) => month < date.slice(0, 7))
        .slice(-3)
        .map(([, a]) => a);
    const historical = completed.length
      ? completed.reduce((a, m) => a + m.income, 0) / completed.length
      : incomeBaseline;
    const liquidSavings = savings
      .filter((a) => a.type === "savings")
      .reduce((a, c) => a + major(balances[c.key]), 0);
    const investment = savings
      .filter((a) => a.type === "investment")
      .reduce((a, c) => a + major(balances[c.key]), 0);
    const checkingBalance = major(balances[checking.key]);
    const wealth =
      checkingBalance +
      liquidSavings +
      investment -
      major(cardDebt()) -
      loans.reduce((a, l) => a + major(l.outstandingPrincipalMinor), 0);
    wealthPeak = Math.max(wealthPeak, wealth);
    const nextSalary = salaryDates.find((d) => d >= date),
      lastSalary = salaryDates.filter((d) => d <= date).at(-1);
    let overspending = 0;
    for (const [, m] of [...activity.entries()]
      .filter(([key]) => key < date.slice(0, 7))
      .reverse()) {
      if (m.expenses > m.income) overspending++;
      else break;
    }
    const today = incomes.get(date) ?? [];
    return {
      date,
      categorySpending: current.categories,
      income: [
        ...today.map((p) => ({
          amount: major(p.amountMinor),
          income: p.income,
        })),
        ...(byDay.get(date) ?? [])
          .filter((e) => e.type === "inheritance")
          .map((e) => ({
            amount: e.amount,
            income: {
              main: false,
              kind: "other" as const,
              expected: e.expected ?? false,
              cadence: "exceptional" as const,
              change: "temporary" as const,
            },
          })),
      ],
      values: {
        monthlyIncomeGrowth:
          historical > 0
            ? (current.income / historical - 1) * 100
            : current.income > 0
              ? 100
              : 0,
        salaryDecrease: Math.max(
          0,
          ...today
            .filter(
              (p) =>
                p.income.kind === "salary" || (!p.income.kind && p.income.main),
            )
            .map((p) =>
              p.income.amount > 0
                ? (1 - major(p.amountMinor) / p.income.amount) * 100
                : 0,
            ),
        ),
        incomeAbsentDays: lastIncomeDate
          ? differenceDays(date, lastIncomeDate)
          : differenceDays(date, config.startDate) + 1,
        checkingBalance,
        savingsBalance: liquidSavings,
        liquidAssetsMonths:
          expenseCoverage > 0
            ? (checkingBalance + liquidSavings) / expenseCoverage
            : 0,
        availableLiquidity:
          major(available()) +
          withdrawal
            .filter((a) => a.type === "savings")
            .reduce((a, c) => a + major(balances[c.key]), 0),
        netWorth: wealth,
        netWorthDecline: wealthPeak > 0 ? (1 - wealth / wealthPeak) * 100 : 0,
        investmentBalance: investment,
        emergencyFundMonths:
          expenseCoverage > 0 ? liquidSavings / expenseCoverage : 0,
        discretionaryPercent:
          discretionaryBaseline > 0
            ? (current.discretionary / discretionaryBaseline) * 100
            : 0,
        overspendingMonths: overspending,
        unexpectedExpense: (byDay.get(date) ?? [])
          .filter((e) => e.type === "exceptional" && !e.expected)
          .reduce((sum, e) => sum + e.amount, 0),
        dayOfMonth: parts(date)[2],
        monthOfYear: parts(date)[1],
        daysBeforeSalary: nextSalary ? differenceDays(nextSalary, date) : 1e9,
        daysAfterSalary: lastSalary ? differenceDays(date, lastSalary) : 1e9,
      },
    };
  }

  function post(
    account: LedgerAccount,
    amountMinor: number,
    label: string,
    options: PostingOptions,
  ): void {
    if (!amountMinor) return;
    if (!Number.isSafeInteger(amountMinor))
      throw new Error("A posting is not an exact minor-unit amount.");
    const previousBalance = balances[account.key];
    balances[account.key] += amountMinor;
    if (!Number.isSafeInteger(balances[account.key]))
      throw new Error("An account balance exceeds safe monetary precision.");
    if (["savings", "investment"].includes(account.type) && amountMinor < 0) {
      if (balances[account.key] < 0)
        throw new Error("A savings account cannot be overdrawn.");
      const s = interestState[account.key];
      if (s.fortnightBase !== null)
        s.fortnightBase = Math.max(
          0,
          Math.min(s.fortnightBase, balances[account.key]),
        );
    }
    if (account.key === checking.key) {
      if (amountMinor > 0) {
        let repaid = Math.min(amountMinor, Math.max(0, -previousBalance));
        for (const state of cardOverdraft.values()) {
          const applied = Math.min(repaid, state.debt);
          state.debt -= applied;
          repaid -= applied;
        }
      } else if (options.paymentCardId) {
        const state = cardOverdraft.get(options.paymentCardId)!;
        state.debt += Math.max(
          0,
          Math.max(0, -balances[account.key]) - Math.max(0, -previousBalance),
        );
      }
    }
    const subcategory =
      categoryById[options.categoryId ?? -1] ??
      bridgeCategoryByKey[options.category ?? "uncategorized"];
    if (!subcategory)
      throw new Error(`Unknown transaction category: ${options.category}`);
    const category = subcategory.key;
    const m = monthActivity();
    if (["income", "inheritance"].includes(options.kind))
      m.income += major(amountMinor);
    if (amountMinor < 0 && options.kind !== "transfer") {
      m.expenses -= major(amountMinor);
      m.categories[category] =
        (m.categories[category] ?? 0) - major(amountMinor);
      if (
        ["daily", "habit", "travel", "event"].includes(options.kind) &&
        !categoryByKey[category]?.protected
      )
        m.discretionary -= major(amountMinor);
    }
    if (options.kind === "credit-repayment") m.repaid += options.principal ?? 0;
    if (
      options.kind === "transfer" &&
      ["savings", "investment"].includes(account.type)
    )
      m.saved += major(amountMinor);
    transactions.push({
      id: ++transactionId,
      accountKey: account.key,
      accountId: ids[account.key],
      date: stamp(date),
      accountingDate: stamp(options.card ? nextWeekday(date) : date),
      amount: major(amountMinor),
      amountMinor,
      balanceAfter: major(balances[account.key]),
      balanceAfterMinor: balances[account.key],
      categoryId: subcategory.id,
      parentCategoryId: subcategory.parentId,
      category,
      label,
      currency: config.currency,
      simulationKind: options.kind,
      ...(options.paymentCardId
        ? { paymentCardId: options.paymentCardId }
        : {}),
      ...(modeEffect &&
      !options.transferRuleId &&
      !["income", "inheritance", "credit-drawdown"].includes(options.kind)
        ? { modeId: modeEffect.mode.id }
        : {}),
      ...(options.eventId ? { eventId: options.eventId } : {}),
      ...(options.incomeId ? { incomeId: options.incomeId } : {}),
      ...(options.loanId ? { loanId: options.loanId } : {}),
      ...(options.merchantId !== undefined
        ? { merchantId: options.merchantId }
        : {}),
      ...(options.transferId ? { transferId: options.transferId } : {}),
      ...(options.transferRuleId
        ? { transferRuleId: options.transferRuleId }
        : {}),
      ...(options.fx ? { fx: options.fx } : {}),
      ...(options.principal !== undefined
        ? { principal: options.principal }
        : {}),
      ...(options.interest !== undefined ? { interest: options.interest } : {}),
    });
  }
  function transfer(
    from: LedgerAccount,
    to: LedgerAccount,
    amount: number,
    eventId?: string,
    rule?: { id: string; label: string },
    paymentCardId?: string,
  ): void {
    if (amount <= 0) return;
    if (modeEffect && from.type === "checking" && (to.withdrawalRank ?? 0) > 0)
      withdrawalAllowances.set(
        modeWithdrawalKey,
        (withdrawalAllowances.get(modeWithdrawalKey) ?? 0) +
          Math.floor(
            (amount * modeEffect.mode.savingsRules.withdrawalLimitPercent) /
              100,
          ),
      );
    const transferId = `transfer_${++transferNumber}`;
    post(
      from,
      -amount,
      `${rule ? rule.label + " · " : ""}Transfer to ${to.name}`,
      {
        kind: "transfer",
        category:
          paymentCardId && to.type === "deferred-card"
            ? "monthlyDebit"
            : "internalTransfer",
        categoryId: paymentCardId && to.type === "deferred-card" ? 191 : 326,
        transferId,
        eventId,
        transferRuleId: rule?.id,
        paymentCardId,
      },
    );
    post(
      to,
      amount,
      `${rule ? rule.label + " · " : ""}Transfer from ${from.name}`,
      {
        kind: "transfer",
        category: "incomeTransfer",
        categoryId: 282,
        transferId,
        eventId,
        transferRuleId: rule?.id,
        paymentCardId,
      },
    );
  }
  function draw(
    type: Loan["type"],
    amount: number,
    event?: PlannedEvent,
    eventId?: string,
  ): void {
    if (amount <= 0) return;
    const f = config.financing;
    const annualRate =
      type === "mortgage"
        ? event!.mortgageRate
        : type === "consumer"
          ? f.consumerRate
          : f.cardRate;
    const months =
      type === "mortgage"
        ? event!.mortgageMonths
        : type === "consumer"
          ? f.consumerMonths
          : f.cardMonths;
    const insurance =
      type === "mortgage"
        ? event!.mortgageInsurance
        : type === "consumer"
          ? f.consumerInsurance
          : f.cardInsurance;
    const loan = createLoan({
      id: `loan_${loans.length + 1}`,
      type,
      label:
        type === "mortgage"
          ? "Property mortgage"
          : type === "consumer"
            ? "Consumer loan"
            : "Card loan",
      principalMinor: amount,
      annualRate,
      months,
      insurance,
      drawDate: date,
      endDate,
      digits,
      eventId,
    });
    loans.push(loan);
    post(checking, amount, loan.label, {
      kind: "credit-drawdown",
      category: "loanIncome",
      categoryId: 441894,
      loanId: loan.id,
      eventId,
    });
  }
  function fund(amount: number, options: ExpenseOptions): void {
    const mortgage =
      (!modeEffect ||
        mandatory(options) ||
        modeEffect.mode.debtRules.allowBorrowing) &&
      options.mortgage?.mortgageEnabled
        ? Math.min(amount, minor(options.mortgage.mortgagePrincipal))
        : 0;
    const cashReserve =
      modeEffect && !essential(options) && !mandatory(options)
        ? minor(modeEffect.mode.liquidityTarget * modeEffect.strength)
        : 0;
    let need = Math.max(0, amount + cashReserve - available() - mortgage);
    for (const account of eligibleWithdrawals(options)) {
      const moved = Math.min(
        need,
        Math.max(0, balances[account.key]),
        modeEffect
          ? (withdrawalAllowances.get(modeWithdrawalKey) ?? 0)
          : Infinity,
      );
      if (modeEffect)
        withdrawalAllowances.set(
          modeWithdrawalKey,
          (withdrawalAllowances.get(modeWithdrawalKey) ?? 0) - moved,
        );
      transfer(account, checking, moved, options.eventId);
      need -= moved;
      if (!need) break;
    }
    if (mortgage) draw("mortgage", mortgage, options.mortgage, options.eventId);
    need = Math.max(0, amount + cashReserve - available());
    if (
      (!modeEffect || modeEffect.mode.debtRules.allowBorrowing) &&
      options.allowCredit !== false &&
      (options.eventScope ||
        config.financing.scope === "all" ||
        config.financing.scope === "current" ||
        config.financing.scope === "events-and-current")
    ) {
      const order: ("consumer" | "card")[] =
        config.financing.priority === "card"
          ? ["card", "consumer"]
          : ["consumer", "card"];
      for (const type of order) {
        const enabled =
          type === "consumer"
            ? config.financing.consumerEnabled
            : config.financing.cardEnabled;
        const limit = minor(
          type === "consumer"
            ? config.financing.consumerLimit
            : config.financing.cardLimit,
        );
        const outstanding = loans
          .filter((l) => l.type === type)
          .reduce((s, l) => s + l.outstandingPrincipalMinor, 0);
        const borrowed = enabled
          ? Math.min(need, Math.max(0, limit - outstanding))
          : 0;
        draw(type, borrowed, undefined, options.eventId);
        need -= borrowed;
      }
    }
    if (options.protected && config.autoTopup && config.topupAmount > 0) {
      const shortage = minor(config.topupThreshold) + amount - available();
      if (shortage > 0)
        post(
          checking,
          Math.ceil(shortage / minor(config.topupAmount)) *
            minor(config.topupAmount),
          "Synthetic external support",
          {
            kind: "support",
            category: "otherIncome",
            categoryId: 3,
            eventId: options.eventId,
          },
        );
    }
  }
  function expense(
    amount: number,
    label: string,
    options: ExpenseOptions,
  ): number {
    if (amount <= 0) return 0;
    if (modeEffect && !mandatory(options) && !canAfford(amount, options)) {
      audit.push({
        date,
        kind: "mode-deferred",
        message: `${modeEffect.mode.label}: ${label} deferred to protect available cash.`,
        amount: major(amount),
      });
      return 0;
    }
    if (options.card && purchaseCard.type !== "debit") {
      const account = cardAccounts.find(
        (a) => a.key === paymentCardAccountKey(purchaseCard.id),
      )!;
      post(account, -amount, label, {
        ...options,
        paymentCardId: purchaseCard.id,
      });
      return amount;
    }
    if (options.card && !options.funded && !cardCanPay(amount, options)) {
      audit.push({
        date,
        kind: "card-declined",
        eventId: options.eventId,
        message: `${purchaseCard.label}: purchase exceeds available funds and the authorized overdraft.`,
        amount: major(amount),
      });
      return 0;
    }
    if (!options.funded) fund(amount, options);
    if (
      options.card &&
      amount >
        available() + cardOverdraftLimit(purchaseCard.authorizedOverdraft)
    ) {
      audit.push({
        date,
        kind: "card-declined",
        eventId: options.eventId,
        message: `${purchaseCard.label}: insufficient available funds.`,
        amount: major(amount),
      });
      return 0;
    }
    post(checking, -amount, label, {
      ...options,
      ...(options.card ? { paymentCardId: purchaseCard.id } : {}),
    });
    return amount;
  }
  const cardOverdraftLimit = (amount: number) =>
    !modeEffect || modeEffect.mode.debtRules.allowOverdraft ? minor(amount) : 0;
  function cardCanPay(amount: number, options: ExpenseOptions): boolean {
    if (options.protected && config.autoTopup && config.topupAmount > 0)
      return true;
    const saved = Math.min(
      eligibleWithdrawals(options).reduce(
        (sum, a) => sum + Math.max(0, balances[a.key]),
        0,
      ),
      modeEffect
        ? (withdrawalAllowances.get(modeWithdrawalKey) ?? 0)
        : Infinity,
    );
    let credit = 0;
    if (
      (!modeEffect || modeEffect.mode.debtRules.allowBorrowing) &&
      options.allowCredit !== false &&
      (options.eventScope ||
        ["all", "current", "events-and-current"].includes(
          config.financing.scope,
        ))
    ) {
      for (const type of ["consumer", "card"] as const) {
        const enabled =
          type === "consumer"
            ? config.financing.consumerEnabled
            : config.financing.cardEnabled;
        const limit =
          type === "consumer"
            ? config.financing.consumerLimit
            : config.financing.cardLimit;
        credit += enabled
          ? Math.max(
              0,
              minor(limit) -
                loans
                  .filter((loan) => loan.type === type)
                  .reduce(
                    (sum, loan) => sum + loan.outstandingPrincipalMinor,
                    0,
                  ),
            )
          : 0;
      }
    }
    return (
      amount <=
      available() +
        saved +
        credit +
        cardOverdraftLimit(purchaseCard.authorizedOverdraft)
    );
  }
  function settleCards(): void {
    for (const card of cards.filter((c) => c.type !== "debit")) {
      const account = cardAccounts.find(
        (a) => a.key === paymentCardAccountKey(card.id),
      )!;
      const outstanding = Math.max(0, -balances[account.key]);
      if (outstanding && cardRepaymentDue(card, date)) {
        const due = cardRepaymentMinor(card, outstanding, digits);
        if (due) {
          fund(due, {
            kind: "transfer",
            protected: true,
            mandatory: true,
            allowCredit: false,
          });
          const paid = Math.min(
            due,
            Math.max(
              0,
              available() + cardOverdraftLimit(card.authorizedOverdraft),
            ),
          );
          transfer(
            checking,
            account,
            paid,
            undefined,
            {
              id: `card-payment:${card.id}`,
              label:
                card.type === "credit"
                  ? `${card.label} repayment`
                  : `${card.label} settlement`,
            },
            card.id,
          );
          monthActivity().repaid += major(paid);
          if (paid < due)
            audit.push({
              date,
              kind: "card-payment-shortfall",
              message: `${card.label}: unpaid amount remains on the card account.`,
              amount: major(due - paid),
            });
        }
      }
      if (card.type === "credit" && cardBillingDue(card, date)) {
        const remaining = Math.max(0, -balances[account.key]);
        const interest = Math.round(
          (remaining * card.creditAnnualRate) / 100 / 12,
        );
        post(account, -interest, `${card.label} monthly interest`, {
          kind: "card-interest",
          category: "bankfees",
          paymentCardId: card.id,
          interest: major(interest),
        });
      }
    }
  }
  function accrueCardOverdraft(): void {
    const [year, month, day] = parts(date);
    for (const card of cards) {
      const state = cardOverdraft.get(card.id)!;
      state.accrued +=
        (Math.min(state.debt, minor(card.authorizedOverdraft)) *
          card.overdraftAnnualRate) /
        100 /
        365;
      if (day === daysInMonth(year, month)) {
        const interest = Math.max(0, Math.round(state.accrued));
        state.accrued -= interest;
        post(
          checking,
          -interest,
          `${card.label} authorized overdraft interest`,
          {
            kind: "card-overdraft-interest",
            category: "bankfees",
            paymentCardId: card.id,
            interest: major(interest),
          },
        );
      }
    }
  }
  function addRecurring(
    event: PlannedEvent,
    amount: number,
    label: string,
    category: string,
    categoryId = bridgeCategoryByKey[category]?.id ?? 276,
  ): void {
    if (amount > 0)
      recurring.push({
        eventId: event.id,
        start: addMonths(event.startDate, 1),
        day: parts(event.startDate)[2],
        amountMinor: minor(amount),
        label,
        category,
        categoryId,
      });
  }
  function refreshConsumption(newMonth: boolean): void {
    const [year, month, day] = parts(date),
      count = daysInMonth(year, month);
    const envelopes = monthlyEnvelopes(
      config,
      reference,
      assumptions,
      state,
      date,
    );
    let wantsScale = 1;
    if (modeEffect?.mode.kind === "balanced") {
      const obligations =
        charges
          .filter(
            (c) =>
              c.enabled &&
              !(c.id === "housing" && replacesHousing(config, date)) &&
              !(replacedHousing && ["housing", "borrower"].includes(c.id)),
          )
          .reduce((sum, c) => sum + chargeAmount(c, date), 0) +
        recurring.reduce((sum, c) => sum + major(recurringAmount(c, date)), 0) +
        (config.incomeTax?.enabled
          ? taxEstimate(config, reference.taxSystem, year).annualTax / 12
          : 0) +
        (config.otherTaxes ?? [])
          .filter((t) => t.enabled)
          .reduce(
            (sum, t) =>
              sum +
              t.amount *
                (t.frequency === "monthly"
                  ? 1
                  : t.frequency === "quarterly"
                    ? 1 / 3
                    : 1 / 12),
            0,
          ) +
        loans.reduce(
          (sum, l) =>
            sum +
            l.schedule
              .filter(
                (r) =>
                  r.status === "scheduled" &&
                  r.dueDate >= date &&
                  r.dueDate < addDays(date, 31),
              )
              .reduce((a, r) => a + r.amount + r.insurance, 0),
          0,
        );
      const needs = categories
        .filter((c) => c.protected)
        .reduce((sum, c) => sum + (envelopes[c.key] ?? 0), 0);
      const wants = categories
        .filter((c) => !c.protected)
        .reduce((sum, c) => sum + (envelopes[c.key] ?? 0), 0);
      const income = Math.max(0, expectedMonthlyIncome());
      wantsScale = blend(
        1,
        Math.min(
          1,
          Math.max(
            0,
            Math.min(
              (income * modeEffect.mode.allocation.wants) / 100,
              income - obligations - needs,
            ),
          ) / Math.max(0.01, wants),
        ),
        modeEffect.strength,
      );
    }
    const extras: Record<string, number> = {};
    if (modeEffect)
      for (const [key, rule] of Object.entries(modeEffect.mode.categoryRules))
        if (rule.substituteTo && rule.substitutionShare) {
          const saved =
            (envelopes[key] ?? 0) *
            Math.max(0, 1 - rule.amount * rule.frequency) *
            rule.substitutionShare *
            modeEffect.strength;
          extras[rule.substituteTo] = (extras[rule.substituteTo] ?? 0) + saved;
        }

    for (const category of categories) {
      const target = Math.round(
        minor(
          (envelopes[category.key] ?? 0) *
            categoryEffect(modeEffect, category.key, config.seed, date).budget *
            (category.protected ? 1 : wantsScale) +
            (extras[category.key] ?? 0),
        ) *
          seasonalFactors(config, category.key, month, assumptions).target *
          (state.prices?.[category.key] ?? 1),
      );
      if (newMonth)
        remaining[category.key] =
          target +
          (["healthOthers", "clothing"].includes(category.key)
            ? Math.min(remaining[category.key] ?? 0, target * 5)
            : 0);
      else
        remaining[category.key] = Math.max(
          0,
          (remaining[category.key] ?? 0) +
            Math.round(
              ((target - (targets[category.key] ?? 0)) * (count - day + 1)) /
                count,
            ),
        );
      targets[category.key] = target;
    }
    rates = merchantRates(config, reference, assumptions, state, date).map(
      (row) => {
        const effect = categoryEffect(
          modeEffect,
          row.merchant.category,
          config.seed,
          date,
        );
        const extra = extras[row.merchant.category] ?? 0,
          base = envelopes[row.merchant.category] ?? 0;
        return {
          ...row,
          mean: row.mean * effect.amount,
          frequency:
            row.frequency *
            effect.frequency *
            (categoryByKey[row.merchant.category]?.protected ? 1 : wantsScale) *
            (base > 0 ? 1 + extra / base : 1),
        };
      },
    );
    ratesByCategory = {};
    for (const row of rates)
      if (row.eligible && row.frequency > 0)
        (ratesByCategory[row.merchant.category] ??= []).push(row);
  }

  const facilities = (config.creditFacilities ?? [])
    .filter((loan) => loan.enabled)
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
    );
  for (const facility of facilities.filter(
    (loan) => loan.startDate < config.startDate,
  ))
    loans.push(facilityLoan(facility, config, endDate));

  for (date of dates(config.startDate, endExclusive)) {
    const [year, month, day] = parts(date),
      monthEnd = day === daysInMonth(year, month),
      todayEvents = byDay.get(date) ?? [];
    let stateChanged = false;
    const eligibleChildren =
      config.children +
      events
        .filter(
          (e) =>
            e.type === "durable-change" &&
            e.change.kind === "birth" &&
            addMonths(e.startDate, 36) <= date,
        )
        .reduce((sum, e) => sum + e.change.childrenAdded, 0);
    if (eligibleChildren !== state.eligibleChildren) {
      state.eligibleChildren = eligibleChildren;
      stateChanged = true;
    }
    // 1. Resolve durable state before posting today's cash flows.
    for (const event of todayEvents.filter(
      (e) => e.type === "durable-change",
    )) {
      if (event.change.kind === "birth") {
        state.household += event.change.childrenAdded;
        stateChanged = true;
      }
      if (event.change.kind === "category-prices") {
        for (const key of event.change.categories)
          state.prices![key] =
            (state.prices![key] ?? 1) *
            (1 + event.change.priceChangePercent / 100);
        stateChanged = true;
      }
      if (event.change.kind === "rent") {
        const charge = charges.find((c) => c.id === event.change.chargeId);
        if (charge) {
          charge.amount = event.change.rent;
          chargeOrigins.set(charge.id, date);
        }
      }
    }
    // 2. Deposits on the first day of a fortnight wait until the next fortnight.
    if (day === 1 || day === 16)
      for (const account of savings)
        interestState[account.key].fortnightBase = Math.max(
          0,
          balances[account.key],
        );
    // 4–5. All enabled income streams and inheritance receipts.
    for (const payment of incomes.get(date) ?? []) {
      post(checking, payment.amountMinor, payment.income.label, {
        kind: "income",
        categoryId:
          payment.income.categoryId ??
          (payment.income.kind === "refund"
            ? 283
            : payment.income.kind === "bonus"
              ? 233
              : payment.income.main || payment.income.kind === "salary"
                ? 230
                : 3),
        incomeId: payment.income.id,
      });
      lastIncomeDate = date;
    }
    for (const event of todayEvents.filter((e) => e.type === "inheritance")) {
      post(checking, minor(event.amount), event.label, {
        kind: "inheritance",
        category: "otherIncome",
        categoryId: 3,
        eventId: event.id,
      });
      if (event.amount > 0) lastIncomeDate = date;
    }
    const previousEffect = modeEffect;
    if (config.spendingModes?.some((m) => m.enabled))
      modeEffect = modeRuntime.step(modeSnapshot());
    if (modeEffect) {
      modeWithdrawalKey = `${modeEffect.mode.id}|${addDays(date, 1 - modeEffect.daysActive)}`;
      if (!withdrawalAllowances.has(modeWithdrawalKey))
        withdrawalAllowances.set(
          modeWithdrawalKey,
          Math.floor(
            (withdrawal.reduce(
              (sum, a) => sum + Math.max(0, balances[a.key]),
              0,
            ) *
              modeEffect.mode.savingsRules.withdrawalLimitPercent) /
              100,
          ),
        );
    }
    if (previousEffect?.mode.id !== modeEffect?.mode.id) {
      audit.push({
        date,
        kind: "mode-change",
        message: modeEffect
          ? `${modeEffect.mode.label} is now controlling spending (priority ${modeEffect.mode.priority}).`
          : "Spending has returned to the baseline profile.",
      });
    }
    if (modeEffect) {
      const last = modeHistory.at(-1);
      if (
        last?.modeId === modeEffect.mode.id &&
        addDays(last.endDate, 1) === date
      ) {
        last.endDate = date;
        last.days++;
      } else
        modeHistory.push({
          modeId: modeEffect.mode.id,
          label: modeEffect.mode.label,
          kind: modeEffect.mode.kind,
          startDate: date,
          endDate: date,
          days: 1,
        });
    }
    // Explicit transfers are commitments, independent of the current spending mode.
    if (config.accountTransfers?.some((t) => t.enabled)) {
      const priorDays = dailyBalances.slice(-30);
      const completedMonths = [...activity.entries()]
        .filter(
          ([month]) =>
            month < date.slice(0, 7) &&
            (config.startDate.endsWith("-01") ||
              month > config.startDate.slice(0, 7)),
        )
        .slice(-3);
      const due = transferRuntime.due({
        date,
        balances: Object.fromEntries(
          Object.entries(balances).map(([key, n]) => [key, major(n)]),
        ),
        averageBalances: Object.fromEntries(
          config.accounts.map((a) => [
            a.key,
            priorDays.length
              ? priorDays.reduce((sum, row) => sum + row.accounts[a.key], 0) /
                priorDays.length
              : a.openingBalance,
          ]),
        ),
        monthlyIncome: monthActivity().income,
        averageMonthlyIncome: completedMonths.length
          ? completedMonths.reduce((sum, [, m]) => sum + m.income, 0) /
            completedMonths.length
          : incomeBaseline,
        incomeToday:
          (incomes.get(date) ?? []).reduce(
            (sum, p) => sum + major(p.amountMinor),
            0,
          ) +
          todayEvents
            .filter((e) => e.type === "inheritance")
            .reduce((sum, e) => sum + e.amount, 0),
      });
      for (const rule of due) {
        const from = config.accounts.find((a) => a.key === rule.fromAccount)!;
        const to = config.accounts.find((a) => a.key === rule.toAccount)!;
        const amount = minor(rule.amount);
        const funds =
          balances[from.key] - (from.type === "checking" ? reserved : 0);
        const belowMinimum =
          rule.timing === "scheduled" &&
          balances[from.key] < minor(rule.minimumSourceBalance ?? 0);
        const room =
          to.ceiling == null
            ? Infinity
            : Math.max(0, minor(to.ceiling) - balances[to.key]);
        if (funds < amount || belowMinimum || room < amount) {
          audit.push({
            date,
            kind: "transfer-skipped",
            transferRuleId: rule.id,
            amount: rule.amount,
            message: `${rule.label}: transfer skipped because ${funds < amount ? from.name + " has insufficient available funds" : belowMinimum ? from.name + " is below the configured minimum balance before transfer" : to.name + " would exceed its deposit ceiling"}.`,
          });
          continue;
        }
        transfer(from, to, amount, undefined, rule);
      }
    }
    // Targets are prorated when a mode changes midmonth; the baseline configuration stays immutable.
    const newMonth = date.slice(0, 7) !== previousMonth;
    const inflationChanged =
      config.inflation &&
      completedMonths(date, config.startDate) !==
        completedMonths(addDays(date, -1), config.startDate);
    if (
      newMonth ||
      stateChanged ||
      modeEffect ||
      previousEffect ||
      inflationChanged
    )
      refreshConsumption(newMonth);
    previousMonth = date.slice(0, 7);
    // Scheduled facilities credit cash once; earlier drawdowns are already in opening balances.
    for (const facility of facilities.filter(
      (loan) => loan.startDate === date,
    )) {
      const loan = facilityLoan(facility, config, endDate);
      loans.push(loan);
      post(checking, loan.principalMinor, loan.label, {
        kind: "credit-drawdown",
        category: "loanIncome",
        categoryId: 441894,
        loanId: loan.id,
      });
    }
    // 7. Loans cannot recursively refinance their own repayments or insurance.
    for (const loan of loans)
      for (const row of loan.schedule.filter(
        (r) => r.dueDate === date && r.status === "scheduled",
      )) {
        expense(row.amountMinor, `${loan.label} repayment`, {
          kind: "credit-repayment",
          category: loan.type === "student" ? "studentLoan" : "mortgageRefund",
          categoryId: loan.type === "student" ? 259 : 89,
          loanId: loan.id,
          eventId: loan.eventId,
          allowCredit: false,
          principal: row.principal,
          interest: row.interest,
        });
        if (row.insuranceMinor)
          expense(row.insuranceMinor, `${loan.label} insurance`, {
            kind: "credit-insurance",
            category: "insurance",
            categoryId: 278,
            loanId: loan.id,
            eventId: loan.eventId,
            allowCredit: false,
          });
        row.status = "paid";
        row.paidDate = date;
        loan.outstandingPrincipalMinor -= row.principalMinor;
        loan.outstandingPrincipal = major(loan.outstandingPrincipalMinor);
        loan.paidPrincipal = major(
          minor(loan.paidPrincipal) + row.principalMinor,
        );
        loan.paidInterest = major(minor(loan.paidInterest) + row.interestMinor);
        loan.paidInsurance = major(
          minor(loan.paidInsurance) + row.insuranceMinor,
        );
      }
    // 8. Durable startup costs and future recurring costs.
    for (const event of todayEvents.filter(
      (e) => e.type === "durable-change" && e.change.kind === "birth",
    )) {
      expense(minor(event.change.birthCost), event.label, {
        mandatory: true,
        kind: "event",
        category: "educationOthers",
        categoryId: 267,
        protected: true,
        eventScope: true,
        eventId: event.id,
      });
      addRecurring(
        event,
        event.change.childMonthlyCost,
        "Childcare costs",
        "daycare",
        267,
      );
    }
    // 9. Explicit purchases and a single funding reservation for each trip.
    for (const event of todayEvents) {
      if (
        event.type === "car" ||
        event.type === "property" ||
        event.type === "exceptional"
      ) {
        const category =
          event.type === "property"
            ? "homeOthers"
            : event.type === "car"
              ? "autoOthers"
              : event.category;
        if (
          modeEffect &&
          ["exceptional", "car", "property"].includes(event.type) &&
          !(event.mandatory ?? event.type !== "exceptional") &&
          !categoryByKey[category]?.protected &&
          categoryEffect(modeEffect, category, config.seed, date).budget < 0.1
        ) {
          audit.push({
            date,
            kind: "mode-deferred",
            eventId: event.id,
            message: `${modeEffect.mode.label}: ${event.label} postponed.`,
            amount: event.amount,
          });
          continue;
        }
        const paid = expense(
          minor(
            event.amount +
              (event.type === "exceptional" ? 0 : event.extraCosts),
          ),
          event.label,
          {
            kind: "event",
            card: event.type === "exceptional",
            category,
            categoryId:
              event.type === "property"
                ? 220
                : event.type === "car"
                  ? 84
                  : categoryByKey[category]?.id,
            eventId: event.id,
            eventScope: true,
            protected: categoryByKey[category]?.protected ?? false,
            mandatory: event.mandatory ?? event.type !== "exceptional",
            mortgage: event.type === "property" ? event : undefined,
          },
        );
        if (!paid && event.amount + event.extraCosts > 0) continue;
        if (event.type === "car") {
          state.car = true;
          refreshConsumption(false);
        }
        if (event.type === "property") {
          housing = "owner";
          if (event.replaceHousingCharge) replacedHousing = true;
        }
        if (event.type !== "exceptional")
          addRecurring(
            event,
            event.monthlyImpact,
            `${event.label} recurring costs`,
            category,
          );
      }
      const trip = trips.find((t) => t.event.id === event.id);
      if (trip) {
        const tripOptions: ExpenseOptions = {
          kind: "travel",
          card: true,
          category: "travel",
          eventScope: true,
          eventId: event.id,
          mandatory: event.mandatory,
        };
        if (
          modeEffect &&
          !event.mandatory &&
          (categoryEffect(modeEffect, "travel", config.seed, date).budget <
            0.1 ||
            !canAfford(trip.totalMinor, tripOptions))
        ) {
          cancelledTrips.add(event.id);
          audit.push({
            date,
            kind: "mode-deferred",
            eventId: event.id,
            message: `${modeEffect.mode.label}: ${event.label} postponed before departure.`,
            amount: major(trip.totalMinor),
          });
          continue;
        }
        if (purchaseCard.type === "debit") {
          if (!cardCanPay(trip.totalMinor, tripOptions)) {
            cancelledTrips.add(event.id);
            audit.push({
              date,
              kind: "card-declined",
              eventId: event.id,
              message: `${purchaseCard.label}: trip exceeds available funds and the authorized overdraft.`,
              amount: major(trip.totalMinor),
            });
            continue;
          }
          fund(trip.totalMinor, tripOptions);
          reserved += trip.totalMinor;
        }
      }
    }
    // Income tax is progressive on annualized configured income. Other tax amounts are per payment.
    if (config.incomeTax?.enabled) {
      const estimate = taxEstimate(config, reference.taxSystem, year);
      const due = taxDue(
        config.incomeTax,
        date,
        estimate.annualTax,
        digits,
        true,
      );
      if (due)
        expense(due, "Income tax", {
          kind: "tax",
          category: "incomeTaxes",
          categoryId: 208,
          protected: true,
          allowCredit: false,
        });
    }
    for (const tax of config.otherTaxes ?? []) {
      const due = taxDue(tax, date, tax.amount, digits);
      if (due)
        expense(due, tax.label, {
          kind: "tax",
          categoryId: tax.categoryId ?? 302,
          protected: true,
          allowCredit: false,
        });
    }
    // 10. Gap outcomes are resolved from actual payment dates in scheduleIncomes.
    // 11. Fixed and event-created monthly charges.
    for (const charge of charges)
      if (
        charge.enabled &&
        day === Math.min(charge.day, daysInMonth(year, month)) &&
        !(replacedHousing && ["housing", "borrower"].includes(charge.id)) &&
        !(charge.id === "housing" && replacesHousing(config, date))
      )
        expense(minor(chargeAmount(charge, date)), charge.name, {
          kind: "recurring",
          category: categoryById[charge.categoryId]?.key ?? "uncategorized",
          categoryId: charge.categoryId,
          protected: true,
        });
    for (const charge of recurring)
      if (
        date >= charge.start &&
        day === Math.min(charge.day, daysInMonth(year, month))
      )
        expense(recurringAmount(charge, date), charge.label, {
          kind: "recurring",
          category: charge.category,
          categoryId: charge.categoryId,
          eventId: charge.eventId,
          protected: true,
        });
    // Card repayments precede today's purchases; charges and taxes stay on the current account.
    settleCards();
    // 12. Reserved trip purchases debit without funding a second time.
    for (const p of tripPostings.get(date) ?? []) {
      if (cancelledTrips.has(p.eventId)) continue;
      if (purchaseCard.type === "debit") reserved -= p.amountMinor;
      expense(p.amountMinor, p.label, {
        kind: "travel",
        category: p.category,
        card: true,
        eventId: p.eventId,
        merchantId: p.merchantId,
        fx: p.fx,
        funded: true,
      });
    }
    // 13. Seeded ordinary purchases, constrained by eligibility and remaining envelopes.
    const activeTrip = trips.find(
      (t) =>
        !cancelledTrips.has(t.event.id) &&
        date >= t.event.startDate &&
        date < addDays(t.event.startDate, t.event.durationDays),
    );
    const homePresence = activeTrip
      ? Math.max(0, 1 - activeTrip.event.travelers / state.household)
      : 1;
    for (const category of categories) {
      const key = category.key,
        pool = ratesByCategory[key] ?? [],
        budget = remaining[key] ?? 0;
      if (
        !pool.length ||
        budget <= 0 ||
        (key === "fuel" && !state.car) ||
        (key === "subscriptionOthers" && !config.events.appstore) ||
        (key === "incidentfees" && balances[checking.key] >= 0)
      )
        continue;
      const season = seasonalFactors(config, key, month, assumptions);
      let count =
        (pool.reduce((s, r) => s + r.frequency, 0) / daysInMonth(year, month)) *
        season.volume *
        homePresence;
      if ([0, 6].includes(weekday(date)))
        count *= ["groceries", "bakery", "restaurants", "fastfood"].includes(
          key,
        )
          ? 1.25
          : 0.9;
      if (!category.protected) {
        count *= Math.max(
          0.15,
          Math.min(1, budget / Math.max(1, targets[key])),
        );
        if (lastIncomeDate && differenceDays(date, lastIncomeDate) < 4)
          count *= 1.35;
        if (available() < minor(config.buffer))
          count *=
            ({ rare: 0.2, occasional: 0.45, repetitive: 0.7 }[
              config.lowBalance
            ] ?? 0.45) *
            ({ supported: 1.15, transition: 1, independent: 0.8 }[
              config.autonomy
            ] ?? 1);
      }
      const attempts = Math.min(
        50,
        Math.floor(count) + (rng() < count % 1 ? 1 : 0),
      );
      if (!attempts) continue;
      const row =
        pool[
          weightedIndex(
            pool.map(
              (r) =>
                r.frequency *
                (modeEffect?.mode.preferCheapMerchants
                  ? (r.merchant.segment === "discount" ? 3 : 1) /
                    Math.max(0.01, r.mean)
                  : 1),
            ),
            rng,
          )
        ];
      for (let i = 0; i < attempts; i++) {
        let amount = Math.max(
          1,
          minor(
            row.mean *
              boundedBasket(rng) *
              season.amount *
              (state.prices?.[key] ?? 1),
          ),
        );
        if (
          amount > remaining[key] &&
          ["healthOthers", "clothing"].includes(key)
        )
          continue;
        amount = Math.min(amount, remaining[key]);
        if (!amount) break;
        const paid = expense(amount, row.merchant.name, {
          kind: "daily",
          category: key,
          merchantId: row.merchant.id,
          card: true,
          protected: category.protected,
        });
        remaining[key] -= paid;
      }
    }
    // 14. Prescheduled habitual events keep independent calendar randomness.
    for (const habit of habits.get(date) ?? []) {
      if (habit.ownerOnly && !["owner", "mortgage"].includes(housing)) continue;
      const modifier = categoryEffect(
        modeEffect,
        habit.category,
        config.seed,
        date,
      );
      if (
        modeEffect &&
        !habit.protected &&
        random(
          `${config.seed}|mode-habit|${modeEffect.mode.id}|${date}|${habit.label}`,
        )() > Math.min(1, modifier.frequency)
      )
        continue;
      const amount = minor(
        (habit.amount *
          budgetInflationFactor(config, habit.category, date) *
          (habit.protected ? 1 : modifier.amount) *
          (state.prices?.[habit.category] ?? 1) *
          state.household) /
          config.household,
      );
      const limit =
        (targets[habit.category] ?? 0) * (habit.category === "travel" ? 8 : 3);
      if (!habit.protected && amount > limit) {
        audit.push({
          date,
          kind: "habit-deferred",
          message: `${habit.label} exceeded the optional expense envelope.`,
          amount: major(amount),
        });
        continue;
      }
      const paid = expense(amount, habit.label, {
        kind: "habit",
        category: habit.category,
        protected: habit.protected,
        eventScope: true,
        card: true,
      });
      remaining[habit.category] = Math.max(
        0,
        (remaining[habit.category] ?? 0) - paid,
      );
    }
    accrueCardOverdraft();
    // 15. Fractional interest remains separate until 31 December capitalization.
    for (const account of savings) {
      const interest = interestState[account.key],
        rate = (account.annualRate ?? 0) / 100;
      if (rate <= 0) continue;
      if (account.interestMode === "daily")
        interest.accrued +=
          (Math.max(0, balances[account.key]) * rate) /
          (daysInMonth(year, 2) === 29 ? 366 : 365);
      else if ((day === 15 || monthEnd) && interest.fortnightBase !== null)
        interest.accrued += (interest.fortnightBase * rate) / 24;
      if (month === 12 && day === 31) {
        post(account, Math.round(interest.accrued), "Savings interest", {
          kind: "savings-interest",
          category: "interestIncome",
          categoryId: 80,
        });
        interest.accrued = 0;
      }
    }
    // 17. Conservative cash reserve before surplus savings, with independent deposit priority.
    if (
      modeEffect
        ? modeEffect.mode.savingsRules.contributionMultiplier > 0 ||
          modeEffect.mode.investmentRules.contributionMultiplier > 0
        : config.autoSavings && config.savingAggression > 0
    ) {
      const until = addDays(date, 30);
      const fixedReserve =
        charges
          .filter(
            (c) =>
              c.enabled &&
              !(replacedHousing && ["housing", "borrower"].includes(c.id)) &&
              !(c.id === "housing" && replacesHousing(config, date)),
          )
          .reduce(
            (s, c) => s + minor(chargeAmount(c, nextChargeDate(c.day))),
            0,
          ) +
        recurring.reduce(
          (s, c) => s + recurringAmount(c, nextChargeDate(c.day)),
          0,
        );
      let taxReserve = 0;
      for (const taxDate of dates(addDays(date, 1), addDays(until, 1))) {
        if (config.incomeTax?.enabled)
          taxReserve += taxDue(
            config.incomeTax,
            taxDate,
            taxEstimate(config, reference.taxSystem, parts(taxDate)[0])
              .annualTax,
            digits,
            true,
          );
        for (const tax of config.otherTaxes ?? [])
          taxReserve += taxDue(tax, taxDate, tax.amount, digits);
      }
      const loanReserve = loans.reduce(
        (s, loan) =>
          s +
          loan.schedule
            .filter(
              (r) =>
                r.status === "scheduled" &&
                r.dueDate > date &&
                r.dueDate <= until,
            )
            .reduce((a, r) => a + r.amountMinor + r.insuranceMinor, 0),
        0,
      );
      const variableReserve = Object.entries(targets).reduce(
        (s, [key, n]) => s + (key === "incidentfees" ? 0 : n),
        0,
      );
      const cardReserve =
        cards
          .filter((card) => card.type !== "debit")
          .reduce((sum, card) => {
            const outstanding = Math.max(
              0,
              -balances[paymentCardAccountKey(card.id)],
            );
            const dueSoon = [
              ...dates(addDays(date, 1), addDays(until, 1)),
            ].some((d) => cardRepaymentDue(card, d));
            return (
              sum +
              (dueSoon ? cardRepaymentMinor(card, outstanding, digits) : 0)
            );
          }, 0) +
        [...cardOverdraft.values()].reduce(
          (sum, state) => sum + Math.max(0, Math.round(state.accrued)),
          0,
        );
      const buffer = minor(
        (modeEffect
          ? blend(
              config.buffer,
              modeEffect.mode.liquidityTarget,
              modeEffect.strength,
            )
          : config.buffer) *
          ({ rare: 1.5, occasional: 1.2, repetitive: 1 }[config.lowBalance] ??
            1),
      );
      const plannedReserve = modeEffect?.mode.planningDays
        ? events
            .filter(
              (e) =>
                e.startDate > date &&
                e.startDate <= addDays(date, modeEffect!.mode.planningDays) &&
                !["inheritance", "income-gap", "durable-change"].includes(
                  e.type,
                ),
            )
            .reduce(
              (sum, e) =>
                sum +
                (trips.find((t) => t.event.id === e.id)?.totalMinor ??
                  minor(e.amount + e.extraCosts)),
              0,
            )
        : 0;
      let sweep = Math.floor(
        Math.max(
          0,
          available() -
            fixedReserve -
            taxReserve -
            loanReserve -
            cardReserve -
            variableReserve -
            buffer -
            (modeEffect?.mode.kind === "planner" ? 0 : plannedReserve),
        ) *
          (modeEffect
            ? blend(config.savingAggression, 1, modeEffect.strength)
            : config.savingAggression),
      );
      if (modeEffect?.mode.kind === "balanced")
        sweep = Math.min(
          sweep,
          Math.max(
            0,
            minor(
              (expectedMonthlyIncome() * modeEffect.mode.allocation.future) /
                100 -
                monthActivity().saved -
                monthActivity().repaid,
            ),
          ),
        );
      let modeDeposits = deposits;
      if (modeEffect) {
        const m = modeEffect.mode;
        modeDeposits = deposits.filter((a) =>
          a.type === "investment"
            ? m.investmentRules.contributionMultiplier > 0
            : m.savingsRules.contributionMultiplier > 0 &&
              (m.kind !== "planner" || (a.withdrawalRank ?? 0) > 0),
        );
        if (m.kind === "investor")
          modeDeposits = [...modeDeposits].sort(
            (a, b) =>
              (b.annualRate ?? 0) - (a.annualRate ?? 0) ||
              (a.depositRank ?? 0) - (b.depositRank ?? 0),
          );
        else if (m.kind === "planner")
          modeDeposits = [...modeDeposits].sort(
            (a, b) =>
              Number(a.type === "investment") -
                Number(b.type === "investment") ||
              (a.depositRank ?? 0) - (b.depositRank ?? 0),
          );
      }
      const initialSweep = sweep;
      let liquidMoved = 0,
        investmentMoved = 0;
      if (sweep >= minor(25))
        for (const account of modeDeposits) {
          const room =
            account.ceiling === null || account.ceiling === undefined
              ? sweep
              : Math.max(0, minor(account.ceiling) - balances[account.key]);
          let flowLimit = sweep;
          if (modeEffect) {
            const m = modeEffect.mode,
              multiplier =
                account.type === "investment"
                  ? m.investmentRules.contributionMultiplier
                  : m.savingsRules.contributionMultiplier;
            flowLimit = Math.max(
              0,
              Math.floor(initialSweep * multiplier) -
                (account.type === "investment" ? investmentMoved : liquidMoved),
            );
            if (m.kind === "planner" && account.type === "investment")
              flowLimit = Math.min(
                flowLimit,
                Math.max(
                  0,
                  savings
                    .filter(
                      (a) =>
                        a.type === "savings" && (a.withdrawalRank ?? 0) > 0,
                    )
                    .reduce((sum, a) => sum + balances[a.key], 0) -
                    plannedReserve,
                ),
              );
          }
          const moved = Math.min(sweep, room, flowLimit);
          if (account.type === "investment") investmentMoved += moved;
          else liquidMoved += moved;
          transfer(checking, account, moved);
          sweep -= moved;
          if (!sweep) break;
        }
    }
    // 18. Bank assets and borrowing stay separate; purchased physical assets are not bank balances.
    const assets = config.accounts.reduce((s, a) => s + balances[a.key], 0),
      debt =
        loans.reduce((s, l) => s + l.outstandingPrincipalMinor, 0) + cardDebt();
    dailyBalances.push({
      date,
      ...(modeEffect
        ? { modeId: modeEffect.mode.id, modeIntensity: modeEffect.strength }
        : {}),
      checking: major(balances[checking.key]),
      assets: major(assets),
      debt: major(debt),
      netAssets: major(assets - debt),
      accounts: Object.fromEntries(
        Object.entries(balances).map(([key, n]) => [key, major(n)]),
      ),
    });
  }

  const sum = (test: (t: Transaction) => boolean) =>
    major(transactions.filter(test).reduce((s, t) => s + t.amountMinor, 0));
  const openingAssets = config.accounts.reduce(
      (s, a) => s + minor(a.openingBalance),
      0,
    ),
    final = dailyBalances.at(-1)!;
  return {
    engineVersion: ENGINE_VERSION,
    fingerprint: financialFingerprint(config, reference, assumptions),
    referenceHash: referenceHash(reference),
    startDate: config.startDate,
    endDate,
    currency: config.currency,
    currencyDigits: digits,
    accounts: allAccounts.map((a) => ({
      key: a.key,
      id: ids[a.key],
      name: a.name,
      bank: a.bank,
      type: a.type,
      ...("paymentCardId" in a ? { paymentCardId: a.paymentCardId } : {}),
      openingBalance: a.openingBalance,
      closingBalance: major(balances[a.key]),
      accruedInterest: major(interestState[a.key]?.accrued ?? 0),
    })),
    transactions: transactions.reverse(),
    dailyBalances,
    modeHistory,
    loans,
    audit,
    monthlyTotals: [
      ...new Set(dailyBalances.map((row) => row.date.slice(0, 7))),
    ].map((month) => {
      const operations = transactions.filter((t) => t.date.startsWith(month));
      const closing = dailyBalances
        .filter((row) => row.date.startsWith(month))
        .at(-1)!;
      return {
        month,
        transactionCount: operations.length,
        income: major(
          operations
            .filter(
              (t) =>
                t.amountMinor > 0 &&
                !["transfer", "credit-drawdown"].includes(t.simulationKind),
            )
            .reduce((s, t) => s + t.amountMinor, 0),
        ),
        expenses: major(
          -operations
            .filter((t) => t.amountMinor < 0 && t.simulationKind !== "transfer")
            .reduce((s, t) => s + t.amountMinor, 0),
        ),
        closingBalance: closing.checking,
        assets: closing.assets,
        debt: closing.debt,
      };
    }),
    monthlyEnvelopes: monthlyEnvelopes(config, reference, assumptions),
    events: events.map((event) => {
      const ops = transactions.filter((t) => t.eventId === event.id),
        trip = trips.find((t) => t.event.id === event.id);
      return {
        id: event.id,
        ...(event.recurrence && event.recurrence !== "once"
          ? { sourceEventId: event.sourceEventId, recurrence: event.recurrence }
          : {}),
        type: event.type,
        label: event.label,
        startDate: event.startDate,
        endDate: addDays(event.startDate, Math.max(1, event.durationDays) - 1),
        status:
          event.startDate > endDate
            ? "scheduled"
            : ["income-gap", "travel-domestic", "travel-abroad"].includes(
                  event.type,
                ) && addDays(event.startDate, event.durationDays) > endExclusive
              ? "active"
              : "completed",
        expenses: major(
          -ops
            .filter((t) => t.amountMinor < 0 && t.simulationKind !== "transfer")
            .reduce((s, t) => s + t.amountMinor, 0),
        ),
        receipts: major(
          ops
            .filter(
              (t) =>
                t.amountMinor > 0 &&
                !["transfer", "credit-drawdown"].includes(t.simulationKind),
            )
            .reduce((s, t) => s + t.amountMinor, 0),
        ),
        borrowed: major(
          ops
            .filter((t) => t.simulationKind === "credit-drawdown")
            .reduce((s, t) => s + t.amountMinor, 0),
        ),
        transactionCount: ops.length,
        loanIds: loans.filter((l) => l.eventId === event.id).map((l) => l.id),
        ...(trip
          ? {
              originalBudget: trip.originalBudget,
              originalCurrency: trip.originalCurrency,
            }
          : {}),
      };
    }),
    summary: {
      openingBalance: checking.openingBalance,
      closingBalance: final.checking,
      openingAssets: major(openingAssets),
      assets: final.assets,
      debt: final.debt,
      netAssets: final.netAssets,
      income: sum(
        (t) =>
          t.amountMinor > 0 &&
          !["transfer", "credit-drawdown"].includes(t.simulationKind),
      ),
      expenses: -sum(
        (t) => t.amountMinor < 0 && t.simulationKind !== "transfer",
      ),
      transfers: sum(
        (t) => t.amountMinor > 0 && t.simulationKind === "transfer",
      ),
      interest: sum((t) => t.simulationKind === "savings-interest"),
      borrowed: sum((t) => t.simulationKind === "credit-drawdown"),
      transactionCount: transactions.length,
      minimumChecking: Math.min(
        checking.openingBalance,
        ...dailyBalances.map((d) => d.checking),
      ),
      negativeDays: dailyBalances.filter((d) => d.checking < 0).length,
    },
  };
}
