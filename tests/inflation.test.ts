import test from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type { ConfigurationFile, PlannedEvent } from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import {
  exportConfiguration,
  parseConfiguration,
  validateScenario,
} from "../src/config";
import { generate, monthlyEnvelopes, merchantRates } from "../src/engine";
import { inflationFactor } from "../src/engine/inflation";
import { toMinor } from "../src/engine/money";

function clean() {
  const file = modernizeScenario(bundled as ConfigurationFile);
  const c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 2;
  c.accounts = [
    {
      key: "checking",
      name: "Current",
      bank: "Synthetic",
      type: "checking",
      openingBalance: 100000,
    },
  ];
  c.incomes = [];
  c.charges = [];
  c.plannedEvents = [];
  c.creditFacilities = [];
  c.spendingModes = [];
  c.accountTransfers = [];
  c.events = Object.fromEntries(
    Object.keys(c.events).map((key) => [key, false]),
  );
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((key) => [key, 0]));
  c.budgetOverrides = {};
  c.costOfLiving = 1;
  c.autoSavings = false;
  c.autoTopup = false;
  c.incomeTax!.enabled = false;
  c.otherTaxes = [];
  c.financing.consumerEnabled = false;
  c.financing.cardEnabled = false;
  return file;
}
const charge = (id: string, amount: number, day = 1) => ({
  id,
  name: id,
  amount,
  day,
  categoryId: 14,
  enabled: true,
});
const run = (file: ConfigurationFile) =>
  generate(file.configuration, file.reference, file.assumptions);

test("yearly inflation starts at the first anniversary and reconciles every daily balance", () => {
  const file = clean();
  const c = file.configuration;
  c.charges = [charge("rent", 1000)];
  const baseline = run(file);
  c.inflation = { rate: 10, period: "yearly" };
  const result = run(file);
  assert.equal(baseline.summary.closingBalance, 76000);
  assert.equal(result.summary.closingBalance, 74800);
  assert.equal(
    result.transactions.find((t) => t.date.startsWith("2025-12-01"))!.amount,
    -1000,
  );
  assert.equal(
    result.transactions.find((t) => t.date.startsWith("2026-01-01"))!.amount,
    -1100,
  );
  let balance = 10000000;
  for (const day of result.dailyBalances) {
    balance += result.transactions
      .filter((t) => t.date.slice(0, 10) === day.date)
      .reduce((sum, t) => sum + t.amountMinor, 0);
    assert.equal(toMinor(day.checking), balance);
  }
  assert.deepEqual(run(file), result, "generation remains deterministic");
});

test("monthly compounding and mixed charge overrides affect only their chosen charges", () => {
  const file = clean();
  const c = file.configuration;
  c.years = 1;
  c.charges = [
    charge("rent", 1000),
    charge("utilities", 100),
    charge("subscription", 10),
  ];
  c.inflation = {
    rate: 10,
    period: "monthly",
    chargeOverrides: {
      rent: { rate: 0, period: "yearly" },
      utilities: { rate: 5, period: "monthly" },
    },
  };
  const result = run(file);
  const spending = (name: string) =>
    -result.transactions
      .filter((t) => t.label === name)
      .reduce((sum, t) => sum + t.amountMinor, 0);
  assert.equal(spending("rent"), 1200000);
  assert.equal(
    spending("utilities"),
    Array.from({ length: 12 }, (_, i) => toMinor(100 * 1.05 ** i)).reduce(
      (a, b) => a + b,
      0,
    ),
  );
  assert.equal(
    spending("subscription"),
    Array.from({ length: 12 }, (_, i) => toMinor(10 * 1.1 ** i)).reduce(
      (a, b) => a + b,
      0,
    ),
  );
  assert.equal(
    toMinor(result.summary.closingBalance),
    10000000 -
      spending("rent") -
      spending("utilities") -
      spending("subscription"),
  );
  delete c.inflation.chargeOverrides!.rent;
  assert.ok(
    run(file).summary.closingBalance < result.summary.closingBalance,
    "removing an override restores inheritance",
  );
});

test("month-end and leap-year anniversaries do not adjust prices early", () => {
  const file = clean();
  const c = file.configuration;
  c.startDate = "2024-01-31";
  c.years = 1;
  c.charges = [charge("rent", 100, 31)];
  c.inflation = { rate: 10, period: "monthly" };
  const result = run(file);
  for (const [date, amount] of [
    ["2024-01-31", -100],
    ["2024-02-29", -110],
    ["2024-03-31", -121],
  ] as const)
    assert.equal(
      result.transactions.find((t) => t.date.startsWith(date))!.amount,
      amount,
    );
  assert.equal(inflationFactor(c.inflation, "2024-02-28", c.startDate), 1);
  assert.equal(
    inflationFactor({ rate: 10, period: "yearly" }, "2025-01-30", c.startDate),
    1,
  );
});

test("inflated budgets scale purchase prices, preserve frequency and lower balances while a 0% category stays unchanged", () => {
  const file = clean();
  const c = file.configuration;
  c.budgetOverrides = { groceries: 300, restaurants: 100 };
  const baseline = run(file);
  c.inflation = {
    rate: 10,
    period: "yearly",
    budgetOverrides: { groceries: { rate: 0, period: "monthly" } },
  };
  const budgets = monthlyEnvelopes(
    c,
    file.reference,
    file.assumptions,
    undefined,
    "2026-01-01",
  );
  assert.equal(budgets.groceries, 300);
  assert.equal(budgets.restaurants, 110);
  const initialRates = merchantRates(c, file.reference, file.assumptions);
  const laterRates = merchantRates(
    c,
    file.reference,
    file.assumptions,
    undefined,
    "2026-01-01",
  );
  laterRates.forEach((row, i) => {
    assert.equal(row.frequency, initialRates[i].frequency);
    if (row.merchant.category === "restaurants")
      assert.equal(toMinor(row.mean), toMinor(initialRates[i].mean * 1.1));
  });
  const result = run(file);
  const categoryFlows = (r: typeof result, category: string) =>
    r.transactions
      .filter((t) => t.category === category)
      .map((t) => [t.date, t.amountMinor]);
  assert.deepEqual(
    categoryFlows(result, "groceries"),
    categoryFlows(baseline, "groceries"),
  );
  assert.deepEqual(
    result.transactions.filter((t) => t.date.startsWith("2025")),
    baseline.transactions.filter((t) => t.date.startsWith("2025")),
  );
  assert.ok(result.summary.expenses > baseline.summary.expenses);
  assert.ok(result.summary.closingBalance < baseline.summary.closingBalance);
  assert.equal(
    toMinor(result.summary.closingBalance - baseline.summary.closingBalance),
    toMinor(baseline.summary.expenses - result.summary.expenses),
  );
  c.inflation.budgetOverrides!.restaurants = { rate: 1, period: "monthly" };
  assert.equal(
    monthlyEnvelopes(
      c,
      file.reference,
      file.assumptions,
      undefined,
      "2026-01-01",
    ).restaurants,
    112.68,
  );
});

test("explicit rent changes establish a new base price for subsequent inflation", () => {
  const file = clean();
  const c = file.configuration;
  c.charges = [charge("rent", 100)];
  c.inflation = { rate: 10, period: "yearly" };
  c.plannedEvents = [
    {
      ...(structuredClone(
        templates.find((e) => e.type === "durable-change")!,
      ) as PlannedEvent),
      enabled: true,
      startDate: "2025-07-01",
      change: {
        ...templates.find((e) => e.type === "durable-change")!.change,
        kind: "rent",
        chargeId: "rent",
        rent: 200,
      },
    },
  ];
  const result = run(file);
  assert.equal(
    result.transactions.find((t) => t.date.startsWith("2026-01-01"))!.amount,
    -200,
  );
  assert.equal(
    result.transactions.find((t) => t.date.startsWith("2026-07-01"))!.amount,
    -220,
  );
});

test("inflation round-trips with reproducible history, and invalid settings are rejected", () => {
  const file = clean();
  const c = file.configuration;
  c.charges = [charge("rent", 100)];
  c.budgetOverrides = { groceries: 100 };
  c.inflation = {
    rate: 2,
    period: "yearly",
    chargeOverrides: { rent: { rate: 0.2, period: "monthly" } },
    budgetOverrides: { groceries: { rate: 0, period: "monthly" } },
  };
  const restored = parseConfiguration(
    JSON.stringify(exportConfiguration(c, file.reference, file.assumptions)),
  );
  assert.deepEqual(restored.configuration.inflation, c.inflation);
  assert.deepEqual(run(restored), run(file));
  for (const inflation of [
    { rate: -100, period: "yearly" },
    { rate: 2, period: "weekly" },
    {
      rate: 2,
      period: "yearly",
      chargeOverrides: { missing: { rate: 3, period: "monthly" } },
    },
    {
      rate: 2,
      period: "yearly",
      budgetOverrides: { missing: { rate: 3, period: "monthly" } },
    },
  ])
    assert.ok(
      validateScenario({ ...c, inflation }, file.reference, file.assumptions)
        .length,
    );
  assert.ok(
    validateScenario(
      { ...c, years: 20, inflation: { rate: 100, period: "monthly" } },
      file.reference,
      file.assumptions,
    ).some((i) => i.path === "configuration.inflation.rate"),
  );
});
