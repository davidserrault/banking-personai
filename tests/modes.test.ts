import { test } from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type {
  PersonaConfig,
  CountryMerchantReference,
  Assumptions,
  PlannedEvent,
  Income,
} from "../src/domain/types";
import type { SpendingMode, SpendingModeKind } from "../src/domain/modes";
import { newSpendingMode } from "../src/config/modes";
import {
  ModeRuntime,
  matchesGroup,
  matchesTrigger,
  categoryEffect,
  type ModeSnapshot,
} from "../src/engine/modes";
import { generate, financialFingerprint } from "../src/engine";
import { dates } from "../src/engine/calendar";
import { validateScenario } from "../src/config/validation";
import {
  exportConfiguration,
  parseConfiguration,
  exportHistory,
} from "../src/config/files";
import { newPaymentCard } from "../src/config/payment-cards";
const reference = bundled.reference as CountryMerchantReference,
  assumptions = bundled.assumptions as Assumptions;
function clean(): PersonaConfig {
  const c = structuredClone(bundled.configuration) as PersonaConfig;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.incomes = [];
  c.charges = [];
  c.plannedEvents = [];
  c.accounts = [
    {
      key: "checking",
      name: "Current",
      bank: "Fictional",
      type: "checking",
      openingBalance: 0,
    },
  ];
  c.events = Object.fromEntries(Object.keys(c.events).map((k) => [k, false]));
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((k) => [k, 0]));
  c.budgetOverrides = {};
  c.autoSavings = false;
  c.autoTopup = false;
  c.financing.consumerEnabled = false;
  c.financing.cardEnabled = false;
  c.savingAggression = 0;
  c.seasonality.enabled = false;
  return c;
}
function mode(
  kind: SpendingModeKind = "survival",
  patch: Partial<SpendingMode> = {},
): SpendingMode {
  return {
    ...newSpendingMode(kind, kind, "2025-01-01"),
    randomness: 0,
    ...patch,
  };
}
const snapshot = (
  date: string,
  values: ModeSnapshot["values"] = {},
): ModeSnapshot => ({ date, values, categorySpending: {}, income: [] });
const run = (c: PersonaConfig) => generate(c, reference, assumptions);
const salary = (amount = 2000, patch: Partial<Income> = {}): Income => ({
  id: "salary",
  label: "Salary",
  amount,
  frequency: "monthly",
  day: 1,
  month: 1,
  amountVariation: 0,
  frequencyVariation: 0,
  annualGrowth: 0,
  main: true,
  enabled: true,
  ...patch,
});
const event = (
  type: string,
  patch: Partial<PlannedEvent> = {},
): PlannedEvent => ({
  ...structuredClone(templates.find((e) => e.type === type)!),
  startDate: "2025-01-15",
  ...patch,
});
function addSavings(
  c: PersonaConfig,
  type: "savings" | "investment" = "savings",
  balance = 500,
  key = type,
) {
  c.accounts.push({
    key,
    name: key,
    bank: "Fictional",
    type,
    openingBalance: balance,
    depositRank: 1,
    withdrawalRank: 1,
    annualRate: 0,
    interestMode: "daily",
  });
}

test("empty, disabled and zero-intensity modes preserve the baseline ledger", () => {
  const c = structuredClone(bundled.configuration) as PersonaConfig,
    baseline = run(c);
  for (const modes of [
    [],
    [mode("yolo", { enabled: false })],
    [mode("survival", { intensity: 0 })],
  ]) {
    c.spendingModes = modes;
    const result = run(c);
    assert.deepEqual(result.transactions, baseline.transactions);
    assert.deepEqual(result.dailyBalances, baseline.dailyBalances);
    assert.deepEqual(result.modeHistory, []);
  }
});
test("mode duration, priorities, tie-breaking and restoration use inclusive dates", () => {
  const low = mode("balanced", { id: "a", duration: 10 }),
    high = mode("survival", { id: "b", startDate: "2025-01-03", duration: 3 });
  const runtime = new ModeRuntime([high, low], "2025-01-01");
  const active = [...dates("2025-01-01", "2025-01-12")].map(
    (d) => runtime.step(snapshot(d))?.mode.id ?? "baseline",
  );
  assert.deepEqual(active, [
    "a",
    "a",
    "b",
    "b",
    "b",
    "a",
    "a",
    "a",
    "a",
    "a",
    "baseline",
  ]);
  assert.equal(
    new ModeRuntime(
      [mode("yolo", { id: "z" }), mode("balanced", { id: "a" })],
      "2025-01-01",
    ).step(snapshot("2025-01-01"))?.mode.id,
    "a",
  );
});
test("yearly recurrence crosses years, and monthly expired windows do not restart cooldown", () => {
  const annual = mode("yolo", {
    startDate: "2024-12-20",
    endDate: "2025-01-05",
    duration: undefined,
    recurrence: "yearly",
  });
  const runtime = new ModeRuntime([annual], "2025-01-01");
  const active = [...dates("2025-01-01", "2026-01-07")].filter((d) =>
    runtime.step(snapshot(d)),
  );
  assert.equal(active.length, 22);
  assert.ok(active.includes("2025-01-05"));
  assert.ok(!active.includes("2025-01-06"));
  assert.ok(active.includes("2025-12-20"));
  const monthly = new ModeRuntime(
    [mode("planner", { duration: 2, cooldown: 60, recurrence: "monthly" })],
    "2025-01-01",
  );
  const selected = [...dates("2025-01-01", "2025-04-04")].filter((d) =>
    monthly.step(snapshot(d)),
  );
  assert.deepEqual(selected, [
    "2025-01-01",
    "2025-01-02",
    "2025-04-01",
    "2025-04-02",
  ]);
});
test("financial deactivation and cooldown prevent immediate reactivation", () => {
  const m = mode("survival", {
    cooldown: 3,
    activationTriggers: {
      match: "all",
      rules: [{ metric: "checkingBalance", operator: "lt", value: 500 }],
    },
    deactivationTriggers: {
      match: "any",
      rules: [{ metric: "checkingBalance", operator: "gte", value: 1000 }],
    },
  });
  const rt = new ModeRuntime([m], "2025-01-01");
  assert.ok(rt.step(snapshot("2025-01-01", { checkingBalance: 100 })));
  assert.equal(
    rt.step(snapshot("2025-01-02", { checkingBalance: 1000 })),
    undefined,
  );
  assert.equal(
    rt.step(snapshot("2025-01-03", { checkingBalance: 100 })),
    undefined,
  );
  assert.ok(rt.step(snapshot("2025-01-05", { checkingBalance: 100 })));
});
test("transitions blend amounts and frequencies without consuming the baseline random stream", () => {
  const rt = new ModeRuntime(
    [mode("yolo", { duration: 10, transitionDuration: 3, intensity: 0.9 })],
    "2025-01-01",
  );
  const strengths = [...dates("2025-01-01", "2025-01-12")].map(
    (d) => rt.step(snapshot(d))?.strength ?? 0,
  );
  assert.ok(Math.abs(strengths[0] - 0.3) < 1e-10);
  assert.equal(strengths[2], 0.9);
  assert.ok(Math.abs(strengths[9] - 0.3) < 1e-10);
  assert.equal(strengths[10], 0);
  const effect = { mode: mode("yolo"), strength: 1, daysActive: 1 };
  assert.deepEqual(
    categoryEffect(effect, "restaurants", "seed", "2025-01-01"),
    { amount: 1.5, frequency: 2, budget: 3 },
  );
  assert.deepEqual(categoryEffect(effect, "taxes", "seed", "2025-01-01"), {
    amount: 1,
    frequency: 1,
    budget: 1,
  });
});
test("all trigger families and income classification support all/any combinations", () => {
  const s = snapshot("2025-06-24", {
    checkingBalance: 300,
    netWorthDecline: 12,
    daysBeforeSalary: 4,
    daysAfterSalary: 26,
    dayOfMonth: 24,
    monthOfYear: 6,
    overspendingMonths: 2,
    monthlyIncomeGrowth: 25,
    liquidAssetsMonths: 1.5,
    emergencyFundMonths: 1,
  });
  s.categorySpending.restaurants = 600;
  s.income = [
    {
      amount: 1500,
      income: {
        main: false,
        kind: "bonus",
        expected: false,
        cadence: "exceptional",
        change: "temporary",
      },
    },
    { amount: 2000, income: { main: true, kind: "salary" } },
  ];
  assert.ok(
    matchesGroup(
      {
        match: "all",
        rules: [
          {
            metric: "unexpectedIncome",
            operator: "gt",
            value: 1000,
            incomeKind: "bonus",
            incomeExpected: "unexpected",
            incomeCadence: "exceptional",
            incomeChange: "temporary",
          },
          { metric: "checkingBalance", operator: "lt", value: 500 },
          { metric: "netWorthDecline", operator: "gte", value: 10 },
          { metric: "daysBeforeSalary", operator: "lte", value: 7 },
          {
            metric: "categorySpending",
            operator: "gt",
            value: 500,
            category: "restaurants",
          },
          { metric: "overspendingMonths", operator: "gte", value: 2 },
        ],
      },
      s,
    ),
  );
  assert.equal(
    matchesTrigger({ metric: "refundReceived", operator: "gt", value: 0 }, s),
    false,
  );
  assert.ok(
    matchesTrigger(
      {
        metric: "dateRange",
        operator: "eq",
        value: 0,
        date: "2025-06-15",
        endDate: "2025-08-31",
      },
      s,
    ),
  );
  assert.ok(
    matchesGroup(
      {
        match: "any",
        rules: [
          { metric: "bonusReceived", operator: "gt", value: 0 },
          { metric: "checkingBalance", operator: "lt", value: 0 },
        ],
      },
      s,
    ),
  );
});
test("one-off unexpected bonus activates immediately, transfers and loans do not count as income", () => {
  const c = clean();
  c.incomes = [
    salary(1500, {
      kind: "bonus",
      expected: false,
      cadence: "exceptional",
      change: "temporary",
      frequency: "once",
      startDate: "2025-02-10",
    }),
  ];
  c.spendingModes = [
    mode("yolo", {
      active: false,
      activationTriggers: {
        match: "all",
        rules: [
          {
            metric: "unexpectedIncome",
            operator: "gt",
            value: 1000,
            incomeCadence: "exceptional",
          },
        ],
      },
    }),
  ];
  const result = run(c);
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "income").length,
    1,
  );
  assert.equal(result.modeHistory[0].startDate, "2025-02-10");
  assert.equal(result.modeHistory[0].days, 30);
  c.incomes = [];
  c.accounts[0].openingBalance = 50000;
  c.creditFacilities = [
    {
      id: "loan",
      type: "personal",
      label: "Loan",
      enabled: true,
      startDate: "2025-02-10",
      amount: 5000,
      annualRate: 0,
      months: 12,
      replaceHousingCharge: false,
    },
  ];
  assert.deepEqual(run(c).modeHistory, []);
});
test("Survival preserves unavoidable payments, stops optional spending and uses liquid savings only", () => {
  const c = clean();
  addSavings(c);
  addSavings(c, "investment", 1000);
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 1000,
      day: 5,
      categoryId: 800,
      enabled: true,
    },
  ];
  c.budgetOverrides = { leisure: 500, groceries: 200 };
  c.spendingModes = [mode("survival")];
  const result = run(c),
    jan = result.transactions.filter((t) => t.date.startsWith("2025-01"));
  assert.equal(
    jan.filter((t) => t.simulationKind === "recurring")[0].amount,
    -1000,
  );
  assert.equal(jan.filter((t) => t.category === "leisure").length, 0);
  assert.equal(jan.filter((t) => t.accountKey === "investment").length, 0);
  assert.equal(
    jan
      .filter((t) => t.accountKey === "savings")
      .reduce((sum, t) => sum + t.amount, 0),
    -500,
  );
  assert.ok(
    result.dailyBalances.find((d) => d.date === "2025-01-05")!.checking < 0,
  );
  assert.equal(
    jan.filter((t) => t.simulationKind === "credit-drawdown").length,
    0,
  );
});
test("YOLO increases spending and respects the configured overdraft limit", () => {
  const c = clean();
  c.accounts[0].openingBalance = 100000;
  c.budgetOverrides = { restaurants: 1000, leisure: 500, shopping: 700 };
  const baseline = run(c);
  c.spendingModes = [mode("yolo", { duration: 365, liquidityTarget: 0 })];
  const yolo = run(c);
  const daily = (r: typeof yolo) =>
    r.transactions.filter((t) => t.simulationKind === "daily");
  assert.ok(daily(yolo).length > daily(baseline).length);
  assert.ok(yolo.summary.expenses > baseline.summary.expenses * 1.2);
  c.accounts[0].openingBalance = 0;
  c.overdraft = true;
  c.overdraftLimit = 200;
  c.paymentCards = [newPaymentCard()];
  c.paymentCards[0].authorizedOverdraft = 200;
  const limited = run(c);
  assert.ok(limited.summary.minimumChecking >= -200);
  assert.ok(limited.summary.expenses > 0);
  assert.equal(limited.loans.length, 0);
});
test("Balanced reduces wants when obligations exceed the target and does not skip obligations", () => {
  const c = clean();
  c.accounts[0].openingBalance = 2000;
  c.incomes = [salary()];
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 1950,
      day: 1,
      categoryId: 800,
      enabled: true,
    },
  ];
  c.budgetOverrides = { groceries: 200, leisure: 1000 };
  c.spendingModes = [mode("balanced", { duration: 365 })];
  const result = run(c);
  assert.equal(
    result.transactions.filter((t) => t.category === "leisure").length,
    0,
  );
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "recurring").length,
    12,
  );
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "credit-drawdown")
      .length,
    0,
  );
});
test("Investor routes windfalls to eligible investments while Planner keeps reserves accessible", () => {
  const c = clean();
  c.accounts[0].openingBalance = 10000;
  addSavings(c, "savings", 0);
  addSavings(c, "investment", 0);
  c.accounts[2].annualRate = 4;
  c.spendingModes = [mode("investor", { duration: 365 })];
  const investor = run(c);
  assert.ok(
    investor.accounts.find((a) => a.key === "investment")!.closingBalance >
      8000,
  );
  assert.ok(investor.summary.minimumChecking >= 500);
  c.accounts[1].withdrawalRank = 0;
  c.spendingModes = [mode("planner", { duration: 365 })];
  const planner = run(c);
  assert.equal(
    planner.accounts.find((a) => a.key === "savings")!.closingBalance,
    0,
  );
  assert.equal(
    planner.accounts.find((a) => a.key === "investment")!.closingBalance,
    0,
  );
  assert.equal(planner.summary.closingBalance, 10000);
  c.accounts[1].withdrawalRank = 1;
  c.plannedEvents = [
    event("exceptional", { amount: 3000, mandatory: true, category: "home" }),
  ];
  const accessible = run(c);
  assert.ok(
    accessible.accounts.find((a) => a.key === "savings")!.closingBalance > 0,
  );
  assert.equal(accessible.summary.negativeDays, 0);
  assert.equal(accessible.summary.expenses, 3000);
});
test("investment withdrawals wait for the configured persistence and never overdraw savings", () => {
  const c = clean();
  addSavings(c, "investment", 1000);
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 200,
      day: 1,
      categoryId: 800,
      enabled: true,
    },
  ];
  const m = mode("yolo", { duration: 90 });
  m.investmentRules.withdrawAfterDays = 31;
  c.spendingModes = [m];
  const result = run(c);
  assert.equal(
    result.transactions.filter(
      (t) =>
        t.accountKey === "investment" &&
        t.amount < 0 &&
        t.date.startsWith("2025-01"),
    ).length,
    0,
  );
  assert.ok(
    result.transactions.some(
      (t) =>
        t.accountKey === "investment" &&
        t.amount < 0 &&
        t.date.startsWith("2025-02"),
    ),
  );
  assert.ok(result.dailyBalances.every((d) => d.accounts.investment >= 0));
});
test("existing debt is not mistaken for a new wealth decline", () => {
  const c = clean();
  c.accounts[0].openingBalance = 50000;
  c.creditFacilities = [
    {
      id: "historic",
      type: "personal",
      label: "Old loan",
      enabled: true,
      startDate: "2024-12-01",
      amount: 10000,
      annualRate: 0,
      months: 24,
      replaceHousingCharge: false,
    },
  ];
  c.spendingModes = [
    mode("survival", {
      active: false,
      activationTriggers: {
        match: "all",
        rules: [{ metric: "netWorthDecline", operator: "gt", value: 1 }],
      },
    }),
  ];
  assert.deepEqual(run(c).modeHistory, []);
});
test("Survival defers optional trips but preserves already committed departures", () => {
  const c = clean();
  c.accounts[0].openingBalance = 100000;
  c.plannedEvents = [
    event("travel-domestic", { startDate: "2025-01-10", amount: 1000 }),
  ];
  c.spendingModes = [mode("survival", { duration: 31 })];
  const stopped = run(c);
  assert.equal(
    stopped.transactions.filter((t) => t.simulationKind === "travel").length,
    0,
  );
  assert.ok(stopped.audit.some((a) => a.kind === "mode-deferred"));
  c.plannedEvents[0].mandatory = true;
  assert.ok(run(c).transactions.some((t) => t.simulationKind === "travel"));
  c.plannedEvents[0].mandatory = false;
  c.spendingModes[0].startDate = "2025-01-11";
  assert.ok(
    run(c).transactions.some(
      (t) => t.simulationKind === "travel" && t.date >= "2025-01-11",
    ),
  );
});
test("mode generation is pure and deterministic; configuration retains modes while statements retain booked operations", () => {
  const c = clean();
  c.accounts[0].openingBalance = 10000;
  c.budgetOverrides = { groceries: 300, restaurants: 300 };
  c.spendingModes = [
    mode("survival"),
    mode("yolo", { startDate: "2025-07-01" }),
  ];
  const before = JSON.stringify(c);
  const one = run(c);
  assert.equal(JSON.stringify(c), before);
  assert.deepEqual(run(c), one);
  const file = exportConfiguration(c, reference, assumptions, "nicolas");
  const parsed = parseConfiguration(JSON.stringify(file));
  assert.deepEqual(parsed.configuration.spendingModes, c.spendingModes);
  assert.deepEqual(run(parsed.configuration), one);
  const hash = financialFingerprint(c, reference, assumptions);
  c.spendingModes[0].label = "Renamed";
  assert.equal(financialFingerprint(c, reference, assumptions), hash);
  const history = exportHistory(one, file);
  assert.equal("modeHistory" in history.included, false);
  assert.equal("configuration" in history.meta, false);
  assert.equal(history.data.length, one.transactions.length);
  assert.equal(history.meta.financialFingerprint, hash);
});
test("invalid dates, allocations, duplicate IDs and unsupported trigger fields are rejected", () => {
  const c = clean();
  c.spendingModes = [mode()];
  assert.deepEqual(validateScenario(c, reference, assumptions), []);
  c.spendingModes[0].startDate = "2025-02-30";
  assert.ok(
    validateScenario(c, reference, assumptions).some((i) =>
      i.path.endsWith("startDate"),
    ),
  );
  c.spendingModes = [mode(), mode()];
  assert.ok(validateScenario(c, reference, assumptions).length > 0);
  c.spendingModes = [
    mode("balanced", { allocation: { needs: 80, wants: 30, future: 20 } }),
  ];
  assert.ok(
    validateScenario(c, reference, assumptions).some((i) =>
      i.path.includes("allocation"),
    ),
  );
});

test("income absence and salary reduction triggers use actual receipts", () => {
  const c = clean();
  c.accounts[0].openingBalance = 10000;
  c.incomes = [salary()];
  c.plannedEvents = [
    event("income-gap", {
      startDate: "2025-02-01",
      durationDays: 50,
      incomeRemainingPercent: 0,
      incomeScope: "all",
    }),
  ];
  c.spendingModes = [
    mode("survival", {
      active: false,
      duration: 10,
      activationTriggers: {
        match: "all",
        rules: [{ metric: "incomeAbsentDays", operator: "gte", value: 40 }],
      },
    }),
  ];
  assert.equal(run(c).modeHistory[0].startDate, "2025-02-10");
  c.plannedEvents[0].incomeRemainingPercent = 50;
  c.spendingModes[0].activationTriggers.rules = [
    { metric: "salaryDecrease", operator: "gte", value: 40 },
  ];
  assert.equal(run(c).modeHistory[0].startDate, "2025-02-01");
});
test("twenty-year recurring modes preserve integer account reconciliation and bounded borrowing", () => {
  const c = clean();
  c.years = 20;
  c.accounts[0].openingBalance = 10000;
  c.incomes = [salary()];
  c.budgetOverrides = { groceries: 300, restaurants: 150 };
  addSavings(c, "savings", 1000);
  c.spendingModes = [
    mode("planner", { duration: 30, recurrence: "yearly" }),
    mode("yolo", {
      startDate: "2025-07-01",
      duration: 30,
      recurrence: "yearly",
    }),
  ];
  const result = run(c);
  assert.equal(result.modeHistory.length, 40);
  assert.ok(result.summary.minimumChecking >= 0);
  for (const account of result.accounts) {
    const postings = result.transactions
      .filter((t) => t.accountKey === account.key)
      .reduce((sum, t) => sum + t.amountMinor, 0);
    assert.equal(
      Math.round(account.openingBalance * 100) + postings,
      Math.round(account.closingBalance * 100),
    );
  }
  const transfers = new Map<string, number>();
  for (const t of result.transactions)
    if (t.transferId)
      transfers.set(
        t.transferId,
        (transfers.get(t.transferId) ?? 0) + t.amountMinor,
      );
  assert.ok([...transfers.values()].every((n) => n === 0));
});

test("retired risk preferences neither change mode deposits nor survive export/import", () => {
  const c = clean();
  c.accounts[0].openingBalance = 10000;
  addSavings(c, "savings", 0);
  addSavings(c, "investment", 0);
  c.spendingModes = [mode("investor", { duration: 365 })];
  // Check both return orderings: the retired selector must neither exclude
  // investments nor prefer them over a savings account with a higher return.
  for (const [savingsRate, investmentRate] of [
    [1, 4],
    [4, 1],
  ]) {
    c.accounts[1].annualRate = savingsRate;
    c.accounts[2].annualRate = investmentRate;
    const baseline = run(c);
    for (const riskProfile of ["conservative", "balanced", "growth"] as const) {
      const legacy = { ...c, riskProfile };
      assert.deepEqual(run(legacy), baseline);
      const exported = exportConfiguration(legacy, reference, assumptions);
      assert.equal("riskProfile" in exported.configuration, false);
      const imported = parseConfiguration(
        JSON.stringify({
          ...exported,
          configuration: { ...exported.configuration, riskProfile },
        }),
      );
      assert.deepEqual(imported.configuration, exported.configuration);
      assert.deepEqual(run(imported.configuration), baseline);
    }
  }
});
