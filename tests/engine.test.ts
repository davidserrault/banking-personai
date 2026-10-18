import { test } from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import legacyFixture from "../specifications/examples/credit-savings-fixture.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type {
  Assumptions,
  CountryMerchantReference,
  PersonaConfig,
  PlannedEvent,
} from "../src/domain/types";
import { generate } from "../src/engine/index";
import { addMonths, nextWeekday } from "../src/engine/calendar";
import { scheduleIncomes } from "../src/engine/incomes";
import { createLoan, facilityLoan } from "../src/engine/loans";
import {
  creditTypes,
  newCreditFacility,
} from "../src/config/credit-facilities";
import { allocateMinor, toMinor } from "../src/engine/money";
import { planTrip } from "../src/engine/travel";
import { newPaymentCard } from "../src/config/payment-cards";

const reference = bundled.reference as CountryMerchantReference;
const assumptions = bundled.assumptions as Assumptions;
function clean(): PersonaConfig {
  const config = structuredClone(bundled.configuration) as PersonaConfig;
  config.startDate = "2025-01-01";
  config.years = 1;
  config.incomes = [];
  config.charges = [];
  config.plannedEvents = [];
  config.accounts = [
    {
      key: "checking",
      name: "Current account",
      bank: "Fictional",
      type: "checking",
      openingBalance: 0,
    },
  ];
  config.events = Object.fromEntries(
    Object.keys(config.events).map((key) => [key, false]),
  );
  config.budgets = Object.fromEntries(
    Object.keys(config.budgets).map((key) => [key, 0]),
  );
  config.budgetOverrides = {};
  config.merchantOverrides = {};
  config.autoSavings = false;
  config.paymentCards = [newPaymentCard()];
  config.paymentCards[0].authorizedOverdraft = 1000000;
  config.autoTopup = false;
  config.savingAggression = 0;
  config.financing.consumerEnabled = false;
  config.financing.cardEnabled = false;
  return config;
}
const event = (
  type: string,
  changes: Partial<PlannedEvent> = {},
): PlannedEvent => ({
  ...structuredClone(templates.find((e) => e.type === type)!),
  startDate: "2025-01-15",
  ...changes,
});

test("all five facility defaults amortize exactly and show the calculated payment", () => {
  const c = clean();
  for (const type of Object.keys(creditTypes) as (keyof typeof creditTypes)[]) {
    const f = newCreditFacility(type, type, c.startDate);
    const loan = facilityLoan(f, c, "2025-12-31");
    assert.equal(
      loan.schedule.reduce((sum, r) => sum + r.principalMinor, 0),
      toMinor(f.amount),
    );
    assert.equal(loan.schedule.at(-1)?.remainingPrincipalMinor, 0);
    assert.equal(loan.schedule.length, f.months);
    if (type === "personal") assert.equal(loan.installment, 234.85);
  }
});

test("a scheduled facility draws once and month-end repayments reconcile cash and debt", () => {
  const c = clean();
  c.creditFacilities = [
    {
      ...newCreditFacility("personal", "loan", "2025-01-31"),
      amount: 1200,
      annualRate: 0,
      months: 12,
    },
  ];
  const r = generate(c, reference, assumptions);
  assert.equal(r.summary.borrowed, 1200);
  assert.equal(r.summary.income, 0);
  assert.equal(r.summary.closingBalance, 100);
  assert.equal(r.summary.debt, 100);
  assert.equal(r.loans[0].paidPrincipal, 1100);
  assert.equal(r.loans[0].schedule[0].dueDate, "2025-02-28");
  assert.equal(r.loans[0].schedule[1].dueDate, "2025-03-31");
  assert.equal(
    r.transactions.filter((t) => t.simulationKind === "credit-drawdown").length,
    1,
  );
  assert.equal(
    r.transactions.filter((t) => t.simulationKind === "credit-repayment")
      .length,
    11,
  );
  let balance = 0;
  for (const t of [...r.transactions].reverse()) {
    balance += t.amountMinor;
    assert.equal(t.balanceAfterMinor, balance);
  }
  for (const day of r.dailyBalances) {
    assert.equal(day.checking, day.debt);
    assert.equal(day.netAssets, 0);
  }
  assert.deepEqual(generate(c, reference, assumptions), r);
});

test("historical facilities carry remaining debt without replaying earlier cash flows", () => {
  const c = clean();
  c.creditFacilities = [
    {
      ...newCreditFacility("auto", "old", "2024-07-31"),
      amount: 1200,
      annualRate: 0,
      months: 12,
    },
  ];
  c.financing.consumerEnabled = true;
  c.financing.cardEnabled = true;
  const r = generate(c, reference, assumptions);
  assert.equal(r.dailyBalances[0].debt, 700);
  assert.equal(r.summary.borrowed, 0);
  assert.equal(r.summary.debt, 0);
  assert.equal(r.summary.closingBalance, -700);
  assert.equal(r.loans.length, 1, "Repayments cannot refinance themselves");
  assert.equal(r.loans[0].paidPrincipal, 700);
  assert.equal(
    r.loans[0].schedule.filter((s) => s.status === "before-window").length,
    5,
  );
  assert.equal(
    r.loans[0].schedule.filter((s) => s.status === "paid").length,
    7,
  );
});

test("a historical payment due on the first day is included; disabled and future facilities stay inactive", () => {
  const c = clean();
  c.creditFacilities = [
    {
      ...newCreditFacility("student", "old", "2024-01-01"),
      amount: 1200,
      annualRate: 0,
      months: 12,
    },
    { ...newCreditFacility("card", "disabled", c.startDate), enabled: false },
    newCreditFacility("mortgage", "future", "2026-01-01"),
  ];
  const r = generate(c, reference, assumptions);
  assert.equal(r.loans.length, 1);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].date.slice(0, 10), c.startDate);
  assert.equal(r.transactions[0].amount, -100);
  assert.equal(r.summary.debt, 0);
});

test("mortgages replace housing only from their start date and retain separate insurance", () => {
  const c = clean();
  c.charges = [
    {
      id: "housing",
      name: "Housing",
      amount: 500,
      day: 5,
      categoryId: 89,
      enabled: true,
    },
    {
      id: "borrower",
      name: "Insurance",
      amount: 20,
      day: 5,
      categoryId: 278,
      enabled: true,
    },
  ];
  c.creditFacilities = [
    {
      ...newCreditFacility("mortgage", "homeImprovement", "2025-02-15"),
      amount: 1200,
      annualRate: 0,
      months: 12,
    },
  ];
  const r = generate(c, reference, assumptions);
  assert.equal(r.transactions.filter((t) => t.label === "Housing").length, 2);
  assert.equal(
    r.transactions.filter((t) => t.label === "Insurance").length,
    12,
  );
  c.creditFacilities[0].replaceHousingCharge = false;
  assert.equal(
    generate(c, reference, assumptions).transactions.filter(
      (t) => t.label === "Housing",
    ).length,
    12,
  );
});

test("facility labels do not alter financial fingerprints but changed terms do", () => {
  const c = clean();
  c.creditFacilities = [newCreditFacility("personal", "stable", c.startDate)];
  const before = generate(c, reference, assumptions);
  c.creditFacilities[0].label = "Renamed";
  assert.equal(
    generate(c, reference, assumptions).fingerprint,
    before.fingerprint,
  );
  c.creditFacilities[0].annualRate = 0;
  assert.notEqual(
    generate(c, reference, assumptions).fingerprint,
    before.fingerprint,
  );
});

test("the migrated financial fixture exactly conserves transfers and settles all in-window installments", () => {
  const c = clean(),
    fixture = legacyFixture.configuration;
  c.accounts = structuredClone(fixture.accounts) as PersonaConfig["accounts"];
  c.autoSavings = true;
  c.financing = fixture.financing;
  c.plannedEvents = fixture.plannedEvents;
  const result = generate(c, reference, assumptions);
  assert.equal(result.summary.borrowed, 6000);
  assert.equal(result.summary.closingBalance, -5768.4);
  assert.equal(result.summary.debt, 513.82);
  assert.equal(result.accounts[1].closingBalance, 0);
  assert.equal(result.loans.length, 1);
  assert.equal(result.loans[0].installment, 516.4);
  assert.equal(
    result.loans[0].schedule.filter((r) => r.status === "paid").length,
    11,
  );
  assert.equal(result.loans[0].schedule.at(-1)?.status, "outside-window");
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "credit-insurance")
      .length,
    11,
  );
  assert.equal(
    result.transactions
      .filter((t) => t.simulationKind === "transfer")
      .reduce((sum, t) => sum + t.amountMinor, 0),
    0,
  );
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "credit-drawdown")
      .length,
    1,
    "Repayments must never finance themselves",
  );
});

test("postings and each daily asset balance reconcile in exact minor units", () => {
  const c = structuredClone(bundled.configuration) as PersonaConfig;
  const result = generate(c, reference, assumptions),
    balances = Object.fromEntries(
      c.accounts.map((a) => [a.key, toMinor(a.openingBalance)]),
    );
  for (const transaction of [...result.transactions].reverse()) {
    balances[transaction.accountKey] += transaction.amountMinor;
    assert.equal(
      transaction.balanceAfterMinor,
      balances[transaction.accountKey],
    );
    assert.ok(Number.isSafeInteger(transaction.amountMinor));
    assert.ok(
      transaction.date.slice(0, 10) >= c.startDate &&
        transaction.date.slice(0, 10) <= result.endDate,
    );
  }
  for (const account of result.accounts)
    assert.equal(toMinor(account.closingBalance), balances[account.key]);
  for (const row of result.dailyBalances)
    assert.equal(
      toMinor(row.assets),
      Object.values(row.accounts).reduce((s, amount) => s + toMinor(amount), 0),
    );
  const transfers = new Map<string, number>();
  for (const t of result.transactions.filter((t) => t.transferId))
    transfers.set(
      t.transferId!,
      (transfers.get(t.transferId!) ?? 0) + t.amountMinor,
    );
  assert.ok([...transfers.values()].every((amount) => amount === 0));
  assert.deepEqual(generate(c, reference, assumptions), result);
});

test("calendar arithmetic clamps month ends and leap anniversaries; cards settle the next weekday", () => {
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2025-01-31", 1), "2025-02-28");
  assert.equal(nextWeekday("2025-01-03"), "2025-01-06");
  assert.equal(nextWeekday("2025-01-06"), "2025-01-07");
  const c = clean();
  c.startDate = "2024-02-29";
  assert.equal(generate(c, reference, assumptions).endDate, "2025-02-27");
});

test("zero-rate and interest-bearing loan schedules settle principal exactly", () => {
  for (const annualRate of [0, 6, 16, 50]) {
    const loan = createLoan({
      id: "test",
      type: "consumer",
      label: "Test",
      principalMinor: 100001,
      annualRate,
      months: 12,
      insurance: 0,
      drawDate: "2025-01-31",
      endDate: "2025-12-31",
      digits: 2,
    });
    assert.equal(
      loan.schedule.reduce((sum, r) => sum + r.principalMinor, 0),
      100001,
    );
    assert.equal(loan.schedule.at(-1)?.remainingPrincipalMinor, 0);
    assert.equal(loan.schedule[0].dueDate, "2025-02-28");
    assert.ok(
      loan.schedule.every(
        (r) => r.amountMinor === r.principalMinor + r.interestMinor,
      ),
    );
  }
});

test("income streams retain independent random amounts and dates when another income is added", () => {
  const c = clean();
  c.incomes = [
    {
      id: "primary",
      label: "Salary",
      amount: 2000,
      frequency: "monthly",
      day: 31,
      month: 1,
      amountVariation: 10,
      frequencyVariation: 90,
      annualGrowth: 3,
      main: true,
      enabled: true,
    },
  ];
  const flatten = (config: PersonaConfig) =>
    [...scheduleIncomes(config, "2026-01-01").values()]
      .flat()
      .filter((p) => p.income.id === "primary");
  const original = flatten(c);
  c.incomes.push({
    ...c.incomes[0],
    id: "secondary",
    main: false,
    amount: 500,
  });
  assert.deepEqual(flatten(c), original);
  assert.ok(original.some((p) => p.date !== p.nominalDate));
});

test("date variation includes payments whose nominal dates are outside the horizon", () => {
  const c = clean();
  c.startDate = "2025-01-15";
  c.incomes = [
    {
      id: "primary",
      label: "Salary",
      amount: 1,
      frequency: "monthly",
      day: 1,
      month: 1,
      amountVariation: 0,
      frequencyVariation: 100,
      annualGrowth: 0,
      main: true,
      enabled: true,
    },
  ];
  let shiftedInside = false;
  for (let seed = 0; seed < 30 && !shiftedInside; seed++) {
    c.seed = String(seed);
    shiftedInside = [...scheduleIncomes(c, "2026-01-15").values()]
      .flat()
      .some(
        (p) => p.nominalDate < c.startDate || p.nominalDate >= "2026-01-15",
      );
  }
  assert.equal(shiftedInside, true);
});

test("income gaps use actual dates and the smallest retained percentage; salary changes restart growth", () => {
  const c = clean();
  c.incomes = [
    {
      id: "salary",
      label: "Salary",
      amount: 1000,
      frequency: "monthly",
      day: 28,
      month: 1,
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
      main: true,
      enabled: true,
    },
  ];
  c.plannedEvents = [
    event("income-gap", {
      id: "gap1",
      durationDays: 60,
      incomeRemainingPercent: 50,
    }),
    event("income-gap", {
      id: "gap2",
      durationDays: 15,
      incomeRemainingPercent: 20,
    }),
    event("durable-change", {
      id: "raise",
      startDate: "2025-03-01",
      change: { ...templates[0].change, kind: "salary", salary: 2000 },
    }),
  ];
  const result = generate(c, reference, assumptions),
    payments = result.transactions
      .filter((t) => t.simulationKind === "income")
      .reverse();
  assert.equal(payments[0].amount, 200);
  assert.equal(payments[1].amount, 500);
  assert.equal(payments[2].amount, 2000);
});

test("fortnight interest excludes an initial incomplete fortnight and respects withdrawals", () => {
  const c = clean();
  c.accounts.push({
    key: "savings",
    name: "Savings",
    bank: "Fictional",
    type: "savings",
    openingBalance: 1000,
    annualRate: 1.7,
    interestMode: "fortnight",
    withdrawalRank: 1,
    depositRank: 0,
  });
  assert.equal(generate(c, reference, assumptions).summary.interest, 17);
  c.startDate = "2025-01-02";
  assert.equal(generate(c, reference, assumptions).summary.interest, 16.29);
  c.startDate = "2025-01-01";
  c.autoSavings = true;
  c.plannedEvents = [
    event("exceptional", { amount: 1000, startDate: "2025-01-15" }),
  ];
  assert.equal(generate(c, reference, assumptions).summary.interest, 0);
});

test("daily savings interest uses leap-year denominator and ignores current-account yield", () => {
  const c = clean();
  c.startDate = "2024-01-01";
  c.accounts[0].annualRate = 30;
  c.accounts.push({
    key: "savings",
    name: "Savings",
    bank: "Fictional",
    type: "savings",
    openingBalance: 1000,
    annualRate: 1.7,
    interestMode: "daily",
  });
  assert.equal(generate(c, reference, assumptions).summary.interest, 17);
});

test("savings deposit ceilings are respected, with remaining surplus routed by rank", () => {
  const c = clean();
  c.accounts[0].openingBalance = 1000;
  c.autoSavings = true;
  c.savingAggression = 1;
  c.buffer = 0;
  c.accounts.push(
    {
      key: "first",
      name: "First",
      bank: "Fictional",
      type: "savings",
      openingBalance: 0,
      annualRate: 0,
      ceiling: 300,
      depositRank: 1,
    },
    {
      key: "second",
      name: "Second",
      bank: "Fictional",
      type: "savings",
      openingBalance: 0,
      annualRate: 0,
      ceiling: 600,
      depositRank: 2,
    },
  );
  const result = generate(c, reference, assumptions);
  assert.deepEqual(
    result.accounts.map((a) => a.closingBalance),
    [100, 300, 600],
  );
  assert.equal(result.summary.assets, 1000);
});

test("explicit mortgage is included before deciding the savings transfer", () => {
  const c = clean();
  c.autoSavings = true;
  c.accounts.push({
    key: "savings",
    name: "Savings",
    bank: "Fictional",
    type: "savings",
    openingBalance: 1000,
    withdrawalRank: 1,
    annualRate: 0,
  });
  c.plannedEvents = [
    event("property", {
      amount: 7000,
      mortgageEnabled: true,
      mortgagePrincipal: 6500,
      mortgageRate: 0,
      mortgageMonths: 100,
      mortgageInsurance: 0,
    }),
  ];
  const result = generate(c, reference, assumptions);
  const purchaseDay = result.transactions.filter((t) =>
    t.date.startsWith("2025-01-15"),
  );
  assert.equal(
    purchaseDay.find((t) => t.amount > 0 && t.simulationKind === "transfer")
      ?.amount,
    500,
  );
  assert.equal(
    purchaseDay.find((t) => t.simulationKind === "credit-drawdown")?.amount,
    6500,
  );
});

test("largest remainder and foreign travel preserve original units, round FX per debit and reserve once", () => {
  assert.deepEqual(allocateMinor(10, [1, 1, 1]), [4, 3, 3]);
  const c = clean(),
    trip = event("travel-abroad", {
      destination: "japan",
      amount: 123457,
      exchangeRate: 160,
      fxFeePercent: 2,
      durationDays: 7,
    });
  const plan = planTrip(c, reference, trip);
  assert.equal(
    plan.postings.reduce((sum, p) => sum - p.fx!.originalMinor, 0),
    123457,
  );
  for (const p of plan.postings)
    assert.equal(p.amountMinor, p.fx!.baseMinor + p.fx!.feeMinor);
  c.plannedEvents = [trip];
  c.financing.consumerEnabled = true;
  c.financing.consumerLimit = 10000;
  const result = generate(c, reference, assumptions);
  assert.equal(
    result.transactions.filter((t) => t.simulationKind === "credit-drawdown")
      .length,
    1,
  );
  assert.equal(result.summary.borrowed, plan.totalMinor / 100);
  assert.equal(
    result.transactions
      .filter((t) => t.simulationKind === "travel")
      .reduce((s, t) => s - t.amountMinor, 0),
    plan.totalMinor,
  );
});

test("legacy bank-fee settings cannot change overdraft operations, balances or financial identity", () => {
  const c = clean();
  delete c.bankFees;
  c.overdraft = false;
  c.plannedEvents = Array.from({ length: 10 }, (_, i) =>
    event("exceptional", {
      id: `expense_${i}`,
      startDate: `2025-01-${String(i + 1).padStart(2, "0")}`,
      amount: 10,
    }),
  );
  const expected = generate(c, reference, assumptions);
  assert.equal(expected.summary.closingBalance, -100);
  assert.equal(expected.transactions.length, 10);
  assert.equal("pendingFees" in expected, false);
  assert.equal("accruedOverdraftInterest" in expected, false);
  assert.equal("fees" in expected.summary, false);
  for (const protection of ["standard", "fragile", "specific", "custom"]) {
    c.bankFees = {
      enabled: true,
      authorizedRate: 50,
      unauthorizedRate: 50,
      minimumQuarterly: 100000,
      commission: 100000,
      monthlyCap: 1000000,
      protection,
    };
    assert.deepEqual(generate(c, reference, assumptions), expected);
  }
});

test("negative balances remain exact across quarter ends, leap years and the history boundary without automatic fees", () => {
  const c = clean();
  c.startDate = "2024-01-01";
  c.years = 2;
  c.accounts[0].openingBalance = -1000;
  c.overdraft = false;
  const result = generate(c, reference, assumptions);
  assert.equal(result.transactions.length, 0);
  assert.ok(result.dailyBalances.every((day) => day.checking === -1000));
  assert.equal(result.summary.closingBalance, -1000);
  assert.equal(
    result.audit.some((entry) => entry.kind === "pending-fee"),
    false,
  );
  c.accounts[0].openingBalance = 0;
  c.years = 1;
  c.startDate = "2025-01-01";
  c.plannedEvents = [
    event("exceptional", { startDate: "2025-12-31", amount: 100 }),
  ];
  const finalDay = generate(c, reference, assumptions);
  assert.equal(finalDay.transactions.length, 1);
  assert.equal(finalDay.summary.closingBalance, -100);
  assert.equal(
    finalDay.audit.some((entry) => entry.kind === "pending-fee"),
    false,
  );
});

test("retired fees never reserve cash before surplus savings transfers", () => {
  const c = clean();
  c.overdraft = false;
  c.autoSavings = true;
  c.savingAggression = 1;
  c.buffer = 0;
  c.accounts.push({
    key: "savings",
    name: "Savings",
    bank: "Fictional",
    type: "savings",
    openingBalance: 0,
    annualRate: 0,
    depositRank: 1,
    withdrawalRank: 0,
  });
  c.plannedEvents = [
    event("exceptional", { startDate: "2025-01-01", amount: 100 }),
  ];
  c.incomes = [
    {
      ...structuredClone(bundled.configuration.incomes[0]),
      amount: 1000,
      day: 2,
      frequencyVariation: 0,
      amountVariation: 0,
      annualGrowth: 0,
      frequency: "monthly",
      startDate: "2025-01-02",
    },
  ];
  delete c.bankFees;
  const expected = generate(c, reference, assumptions);
  const firstDeposit = [...expected.transactions]
    .reverse()
    .find(
      (t) => t.simulationKind === "transfer" && t.accountKey === "savings",
    )!;
  assert.equal(firstDeposit.date.slice(0, 10), "2025-01-02");
  assert.equal(firstDeposit.amount, 900);
  c.bankFees = {
    enabled: true,
    authorizedRate: 50,
    unauthorizedRate: 50,
    minimumQuarterly: 4,
    commission: 8,
    monthlyCap: 80,
    protection: "standard",
  };
  assert.deepEqual(generate(c, reference, assumptions), expected);
});

test("durable rent replaces only subsequent charges and births create costs next month", () => {
  const c = clean();
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 100,
      day: 5,
      categoryId: 89,
      enabled: true,
    },
  ];
  c.plannedEvents = [
    event("durable-change", {
      id: "rent-change",
      change: {
        ...templates[0].change,
        kind: "rent",
        chargeId: "rent",
        rent: 200,
      },
    }),
    event("durable-change", {
      id: "birth",
      change: {
        ...templates[0].change,
        kind: "birth",
        childrenAdded: 1,
        birthCost: 50,
        childMonthlyCost: 20,
      },
    }),
  ];
  const result = generate(c, reference, assumptions),
    rents = result.transactions.filter((t) => t.label === "Rent").reverse(),
    childcare = result.transactions
      .filter((t) => t.label === "Childcare costs")
      .reverse();
  assert.equal(rents[0].amount, -100);
  assert.equal(rents[1].amount, -200);
  assert.equal(childcare[0].date, "2025-02-15T00:00:00");
  assert.equal(childcare.length, 11);
});
