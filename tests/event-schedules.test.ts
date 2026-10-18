import test from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type { ConfigurationFile, PlannedEvent } from "../src/domain/types";
import { generate } from "../src/engine";
import { eventOccurrences } from "../src/engine/events";
import { scheduleIncomes } from "../src/engine/incomes";
import { modernizeScenario } from "../src/config/profile";
import { newSpendingMode } from "../src/config/modes";
import {
  exportConfiguration,
  parseConfiguration,
  exportEventDetails,
} from "../src/config/files";
import { validateScenario } from "../src/config/validation";
import { ModeRuntime } from "../src/engine/modes";
import { dates } from "../src/engine/calendar";

function scenario() {
  const file = modernizeScenario(bundled as ConfigurationFile),
    c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.incomes = [];
  c.charges = [];
  c.accounts = [
    {
      key: "checking",
      name: "Current",
      bank: "Fictional",
      type: "checking",
      openingBalance: 10000,
    },
  ];
  c.plannedEvents = [];
  c.events = Object.fromEntries(Object.keys(c.events).map((k) => [k, false]));
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((k) => [k, 0]));
  c.budgetOverrides = {};
  c.merchantOverrides = {};
  c.autoSavings = c.autoTopup = c.incomeTax!.enabled = false;
  c.financing.consumerEnabled = c.financing.cardEnabled = false;
  return file;
}
const event = (
  type: string,
  patch: Partial<PlannedEvent> = {},
): PlannedEvent => ({
  ...(structuredClone(templates.find((e) => e.type === type)!) as PlannedEvent),
  enabled: true,
  startDate: "2025-01-31",
  amount: 100,
  ...patch,
});
const run = (file: ConfigurationFile) =>
  generate(file.configuration, file.reference, file.assumptions);
const issues = (file: ConfigurationFile) =>
  validateScenario(file.configuration, file.reference, file.assumptions);

test("monthly events retain month-end anchors, settle once per occurrence, and round trip", () => {
  const file = scenario();
  file.configuration.plannedEvents = [
    event("exceptional", { recurrence: "monthly" }),
  ];
  const original = structuredClone(file),
    result = run(file);
  assert.deepEqual(file, original);
  assert.equal(result.events.length, 12);
  assert.deepEqual(
    result.events.slice(0, 4).map((e) => e.startDate),
    ["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"],
  );
  assert.equal(new Set(result.events.map((e) => e.id)).size, 12);
  assert.equal(result.summary.expenses, 1200);
  assert.equal(result.summary.closingBalance, 8800);
  for (const e of result.events) {
    assert.equal(e.sourceEventId, file.configuration.plannedEvents[0].id);
    assert.equal(e.expenses, 100);
    assert.equal(
      result.transactions.filter((t) => t.eventId === e.id).length,
      1,
    );
  }
  const restored = parseConfiguration(
    JSON.stringify(
      exportConfiguration(file.configuration, file.reference, file.assumptions),
    ),
  );
  assert.deepEqual(restored.configuration, file.configuration);
  assert.deepEqual(run(restored), result);
  assert.equal(exportEventDetails(result).events.length, 12);
});

test("yearly leap-day events recover February 29; once and disabled schedules stay unchanged", () => {
  const file = scenario(),
    c = file.configuration;
  c.startDate = "2024-01-01";
  c.years = 5;
  c.plannedEvents = [
    event("inheritance", {
      startDate: "2024-02-29",
      recurrence: "yearly",
      amount: 250,
    }),
  ];
  const yearly = run(file);
  assert.deepEqual(
    yearly.events.map((e) => e.startDate),
    ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
  );
  assert.equal(yearly.summary.income, 1250);
  delete c.plannedEvents[0].recurrence;
  const once = run(file);
  c.plannedEvents[0].recurrence = "once";
  assert.deepEqual(run(file), once);
  assert.equal(once.events.length, 1);
  c.plannedEvents[0].recurrence = "monthly";
  c.plannedEvents[0].enabled = false;
  assert.equal(run(file).events.length, 0);
});

test("recurring income interruptions affect each actual salary payment", () => {
  const file = scenario(),
    c = file.configuration;
  c.incomes = [
    {
      ...structuredClone(bundled.configuration.incomes[0]),
      amount: 1000,
      frequency: "monthly",
      day: 16,
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
    },
  ];
  c.plannedEvents = [
    event("income-gap", {
      startDate: "2025-01-15",
      durationDays: 3,
      recurrence: "monthly",
      incomeRemainingPercent: 50,
    }),
  ];
  const result = run(file);
  assert.equal(result.summary.income, 6000);
  const direct = [...scheduleIncomes(c, "2026-01-01").values()].flat();
  assert.equal(direct.length, 12);
  assert.ok(direct.every((p) => p.amountMinor === 50000));
});

test("repeated trips post separate budgets and stop at the history boundary", () => {
  const file = scenario(),
    c = file.configuration;
  c.plannedEvents = [
    event("travel-domestic", {
      startDate: "2025-01-29",
      durationDays: 5,
      recurrence: "monthly",
    }),
  ];
  const result = run(file);
  assert.equal(result.events.length, 12);
  assert.ok(
    result.events.slice(0, -1).every((e) => Math.abs(e.expenses - 100) < 0.001),
  );
  assert.equal(result.events.at(-1)?.status, "active");
  assert.ok(result.events.at(-1)!.expenses < 100);
  assert.ok(result.transactions.every((t) => t.date < "2026-01-01"));
  assert.deepEqual(run(file), result);
});

test("validation detects overlaps and cumulative changes on later occurrences", () => {
  const file = scenario(),
    c = file.configuration;
  c.plannedEvents = [
    event("travel-domestic", {
      startDate: "2025-01-15",
      durationDays: 5,
      recurrence: "monthly",
    }),
    event("travel-domestic", {
      id: "trip-2",
      startDate: "2025-02-17",
      durationDays: 2,
    }),
  ];
  assert.ok(issues(file).some((i) => /overlaps/.test(i.message)));
  c.plannedEvents = [
    event("travel-domestic", { durationDays: 35, recurrence: "monthly" }),
  ];
  assert.ok(issues(file).some((i) => /overlaps/.test(i.message)));
  const birth = event("durable-change", { recurrence: "monthly" });
  birth.change = { ...birth.change, kind: "birth", childrenAdded: 1 };
  c.plannedEvents = [birth];
  assert.ok(issues(file).some((i) => /household above 12/.test(i.message)));
  const price = event("durable-change", { recurrence: "monthly" });
  price.change = {
    ...price.change,
    kind: "category-prices",
    categories: ["groceries"],
    priceChangePercent: 50,
  };
  c.plannedEvents = [price];
  assert.ok(issues(file).some((i) => /Cumulative groceries/.test(i.message)));
  c.plannedEvents = [
    event("exceptional", { recurrence: "weekly" as "monthly" }),
  ];
  assert.ok(issues(file).some((i) => i.path.endsWith("recurrence")));
});

test("occurrence identifiers cannot collide with imported scheduled-event identifiers", () => {
  const first = event("exceptional", { id: "custom", recurrence: "monthly" });
  const second = event("inheritance", {
    id: "custom@2025-02-28",
    startDate: "2025-02-28",
  });
  const occurrences = eventOccurrences([first, second], "2025-04-01");
  assert.equal(new Set(occurrences.map((e) => e.id)).size, 4);
  assert.equal(
    occurrences.filter((e) => e.sourceEventId === "custom").length,
    3,
  );
});

test("mode editors migrate legacy end dates to a single inclusive duration without a hidden cutoff", () => {
  for (const [duration, expected] of [
    [undefined, 10],
    [5, 5],
    [20, 10],
  ] as const) {
    const file = scenario();
    file.configuration.spendingModes = [
      {
        ...newSpendingMode("survival", "mode", "2025-01-01"),
        duration,
        endDate: "2025-01-10",
      },
    ];
    const original = structuredClone(file);
    const migrated = modernizeScenario(file),
      mode = migrated.configuration.spendingModes![0];
    assert.deepEqual(file, original);
    assert.equal(mode.duration, expected);
    assert.equal("endDate" in mode, false);
    mode.duration = 15;
    const runtime = new ModeRuntime([mode], "2025-01-01");
    const active = [...dates("2025-01-01", "2025-01-20")].filter((date) =>
      runtime.step({ date, values: {}, categorySpending: {}, income: [] }),
    );
    assert.equal(active.length, 15);
    const restored = parseConfiguration(
      JSON.stringify(
        exportConfiguration(
          migrated.configuration,
          migrated.reference,
          migrated.assumptions,
        ),
      ),
    );
    assert.equal(restored.configuration.spendingModes![0].duration, 15);
    assert.equal("endDate" in restored.configuration.spendingModes![0], false);
  }
});

test("repeated property events retain separate loans and ongoing costs", () => {
  const file = scenario(),
    c = file.configuration;
  c.years = 2;
  c.plannedEvents = [
    event("property", {
      recurrence: "yearly",
      amount: 1000,
      extraCosts: 0,
      monthlyImpact: 10,
      mortgageEnabled: true,
      mortgagePrincipal: 600,
      mortgageRate: 0,
      mortgageMonths: 12,
      mortgageInsurance: 0,
    }),
  ];
  const result = run(file);
  assert.equal(result.events.length, 2);
  assert.equal(result.loans.length, 2);
  assert.equal(result.summary.borrowed, 1200);
  assert.equal(result.summary.debt, 50);
  assert.equal(result.summary.closingBalance, 7710);
  for (const occurrence of result.events) {
    assert.equal(occurrence.loanIds.length, 1);
    assert.equal(
      result.loans.find((l) => l.id === occurrence.loanIds[0])?.eventId,
      occurrence.id,
    );
  }
});
