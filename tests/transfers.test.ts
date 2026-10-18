import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import bundled from "../specifications/configurations/nicolas.personia.json";
import andre from "../specifications/configurations/andre.personia.json";
import gb from "../specifications/country-references/gb.example.v1.json";
import type {
  AccountTransfer,
  ConfigurationFile,
  CountryMerchantReference,
} from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import { generate, financialFingerprint } from "../src/engine";
import {
  transferScheduledOn,
  TransferRuntime,
  type TransferSnapshot,
} from "../src/engine/transfers";
import {
  exportConfiguration,
  parseConfiguration,
  exportHistory,
} from "../src/config/files";
import { previewCountryConversion } from "../src/config/conversion";
import { validateScenario } from "../src/config/validation";
import {
  newWorkspace,
  editWorkspace,
  undoWorkspace,
  redoWorkspace,
  parseWorkspace,
  serializeWorkspace,
} from "../src/config/workspace";
import {
  modeConditionOptions,
  newModeCondition,
  newSpendingMode,
  uniqueModeConditions,
} from "../src/config/modes";
import { matchesTrigger } from "../src/engine/modes";
import { differenceDays } from "../src/engine/calendar";
import { AccountTransfers } from "../src/ui/AccountTransfers";
import { Field } from "../src/ui/controls";

function fixture() {
  const file = modernizeScenario(bundled as ConfigurationFile),
    c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.incomes = [];
  c.charges = [];
  c.plannedEvents = [];
  c.incomeTax!.enabled = false;
  c.otherTaxes = [];
  c.creditFacilities = [];
  c.events = Object.fromEntries(
    Object.keys(c.events).map((key) => [key, false]),
  );
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((key) => [key, 0]));
  c.budgetOverrides = {};
  c.merchantOverrides = {};
  c.budgetOverrides = { ...c.budgets };
  c.autoSavings = false;
  c.autoTopup = false;
  c.financing.consumerEnabled = false;
  c.financing.cardEnabled = false;
  c.accounts = ["checking", "savings", "investment"].map((type) => ({
    key: type,
    type: type as "checking" | "savings" | "investment",
    name: type,
    bank: "Fictional bank",
    openingBalance: 10000,
    annualRate: 0,
    withdrawalRank: 0,
    depositRank: 0,
    interestMode: "daily" as const,
  }));
  return file;
}
function rule(patch: Partial<AccountTransfer> = {}): AccountTransfer {
  return {
    id: "scheduled",
    label: "My transfer",
    enabled: true,
    fromAccount: "checking",
    toAccount: "savings",
    amount: 100,
    startDate: "2025-01-01",
    timing: "scheduled",
    recurrence: "once",
    trigger: {
      kind: "balance-below",
      account: "checking",
      threshold: 500,
      cooldownDays: 7,
    },
    ...patch,
  };
}
const run = (file: ConfigurationFile) =>
  generate(file.configuration, file.reference, file.assumptions);
const triggered = (
  kind: AccountTransfer["trigger"]["kind"],
  threshold: number,
  cooldownDays = 1,
) =>
  rule({
    timing: "triggered",
    trigger: { kind, threshold, account: "checking", cooldownDays },
  });
const snapshot = (patch: Partial<TransferSnapshot> = {}): TransferSnapshot => ({
  date: "2025-01-01",
  balances: { checking: 100 },
  averageBalances: { checking: 100 },
  monthlyIncome: 0,
  averageMonthlyIncome: 1000,
  incomeToday: 0,
  ...patch,
});

test("André's saved transfer executes on threshold crossings, respects its interval and reconciles both accounts", () => {
  const file = modernizeScenario(andre as ConfigurationFile);
  const result = run(file);
  const instruction = file.configuration.accountTransfers![0];
  const debits = result.transactions
    .filter((t) => t.transferRuleId === instruction.id && t.amountMinor < 0)
    .reverse();
  assert.ok(debits.length > 0);
  assert.equal(debits[0].date.slice(0, 10), "2026-10-15");
  assert.equal(debits[0].balanceAfterMinor, 570000);
  for (let i = 0; i < debits.length; i++) {
    const debit = debits[i];
    assert.equal(debit.accountKey, instruction.fromAccount);
    assert.equal(debit.amountMinor, -100000);
    assert.ok(debit.balanceAfterMinor - debit.amountMinor > 500000);
    if (i)
      assert.ok(
        differenceDays(
          debit.date.slice(0, 10),
          debits[i - 1].date.slice(0, 10),
        ) >= instruction.trigger.cooldownDays,
      );
    const pair = result.transactions.filter(
      (t) => t.transferId === debit.transferId,
    );
    assert.equal(pair.length, 2);
    assert.equal(
      pair.reduce((sum, t) => sum + t.amountMinor, 0),
      0,
    );
    assert.equal(
      pair.find((t) => t.amountMinor > 0)!.accountKey,
      instruction.toAccount,
    );
  }
  for (const account of result.accounts)
    assert.equal(
      Math.round(account.openingBalance * 100) +
        result.transactions
          .filter((t) => t.accountKey === account.key)
          .reduce((sum, t) => sum + t.amountMinor, 0),
      Math.round(account.closingBalance * 100),
    );
  assert.equal(
    result.audit.filter((a) => a.kind === "transfer-skipped").length,
    0,
  );
});

test("the transfer editor keeps two-account directions valid and supports an optional source minimum", () => {
  const c = fixture().configuration;
  c.accounts = c.accounts.slice(0, 2);
  c.accountTransfers = [rule()];
  const field = (path: string) => {
    let found: React.ComponentProps<typeof Field> | undefined;
    const visit = (node: React.ReactNode) =>
      React.Children.forEach(node, (child) => {
        if (
          !React.isValidElement<
            React.ComponentProps<typeof Field> & {
              children?: React.ReactNode;
            }
          >(child)
        )
          return;
        if (child.type === Field && child.props.path === path)
          found = child.props;
        visit(child.props.children);
      });
    visit(AccountTransfers({ config: c, update: (fn) => fn(c) }));
    assert.ok(found, `Missing field: ${path}`);
    return found;
  };
  const destination = () => field("accountTransfers.0.toAccount");
  assert.deepEqual(destination().options, [["savings", "savings"]]);
  field("accountTransfers.0.fromAccount").onChange("savings");
  assert.equal(c.accountTransfers[0].fromAccount, "savings");
  assert.equal(c.accountTransfers[0].toAccount, "checking");
  assert.deepEqual(destination().options, [["checking", "checking"]]);
  const minimum = () => field("accountTransfers.0.minimumSourceBalance");
  assert.equal(minimum().value, "");
  minimum().onChange(500);
  assert.equal(minimum().value, 500);
  minimum().onChange(NaN);
  assert.equal(minimum().value, "");
  assert.equal("minimumSourceBalance" in c.accountTransfers[0], false);
});

test("transfer schedules anchor month ends, leap days, weekly and quarterly recurrence", () => {
  const monthly = rule({ startDate: "2024-01-31", recurrence: "monthly" });
  for (const date of ["2024-01-31", "2024-02-29", "2024-03-31", "2025-02-28"])
    assert.ok(transferScheduledOn(monthly, date));
  for (const date of ["2024-01-30", "2024-03-29", "2025-01-30"])
    assert.equal(transferScheduledOn(monthly, date), false);
  const yearly = rule({ startDate: "2024-02-29", recurrence: "yearly" });
  assert.ok(transferScheduledOn(yearly, "2025-02-28"));
  assert.ok(transferScheduledOn(yearly, "2028-02-29"));
  assert.equal(transferScheduledOn(yearly, "2028-02-28"), false);
  const quarterly = rule({ startDate: "2024-11-30", recurrence: "quarterly" });
  assert.ok(transferScheduledOn(quarterly, "2025-02-28"));
  assert.ok(transferScheduledOn(quarterly, "2025-05-30"));
  assert.equal(transferScheduledOn(quarterly, "2025-03-30"), false);
  const weekly = rule({
    startDate: "2024-12-30",
    recurrence: "weekly",
    endDate: "2025-01-13",
  });
  assert.ok(transferScheduledOn(weekly, "2025-01-06"));
  assert.ok(transferScheduledOn(weekly, "2025-01-13"));
  assert.equal(transferScheduledOn(weekly, "2025-01-20"), false);
});

test("transfers in all six account directions produce paired postings and conserve assets", () => {
  const f = fixture(),
    c = f.configuration;
  c.accountTransfers = c.accounts.flatMap((from) =>
    c.accounts
      .filter((to) => to.key !== from.key)
      .map((to) =>
        rule({
          id: `${from.key}-${to.key}`,
          fromAccount: from.key,
          toAccount: to.key,
          amount: 123.45,
        }),
      ),
  );
  const before = structuredClone(f),
    r = run(f);
  assert.deepEqual(f, before);
  assert.deepEqual(run(f), r);
  assert.equal(r.transactions.length, 12);
  assert.equal(r.summary.assets, 30000);
  assert.equal(r.summary.income, 0);
  assert.ok(r.summary.expenses === 0);
  for (const id of new Set(r.transactions.map((t) => t.transferId))) {
    const pair = r.transactions.filter((t) => t.transferId === id);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].amountMinor + pair[1].amountMinor, 0);
    assert.equal(pair[0].transferRuleId, pair[1].transferRuleId);
  }
  for (const a of c.accounts) {
    let balance = a.openingBalance * 100;
    for (const t of [...r.transactions]
      .reverse()
      .filter((t) => t.accountKey === a.key)) {
      balance += t.amountMinor;
      assert.equal(t.balanceAfterMinor, balance);
    }
    assert.equal(balance / 100, r.dailyBalances.at(-1)!.accounts[a.key]);
  }
});

test("full transfer amounts require funds and room; skipping creates no debt, fee or partial posting", () => {
  const f = fixture(),
    c = f.configuration;
  c.overdraft = true;
  c.overdraftLimit = 5000;
  c.accounts[0].openingBalance = 100;
  c.accounts[1].ceiling = 10050;
  c.accountTransfers = [
    rule({ id: "funds", amount: 101 }),
    rule({ id: "ceiling", amount: 100 }),
    rule({ id: "negative", fromAccount: "investment", amount: 10001 }),
  ];
  const r = run(f);
  assert.equal(r.transactions.length, 0);
  assert.equal(r.audit.filter((a) => a.kind === "transfer-skipped").length, 3);
  assert.equal(r.summary.debt, 0);
  assert.equal(r.audit[0].transferRuleId, "funds");
});

test("scheduled transfers pause below a custom source minimum and resume on the next eligible date", () => {
  const f = fixture(),
    c = f.configuration;
  c.accounts[0].openingBalance = 500;
  c.incomes = [
    {
      ...bundled.configuration.incomes[0],
      amount: 200,
      frequency: "once",
      startDate: "2025-01-02",
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
    },
  ];
  c.accountTransfers = [
    rule({ recurrence: "monthly", minimumSourceBalance: 600 }),
  ];
  const r = run(f);
  assert.deepEqual(
    r.transactions
      .filter((t) => t.transferRuleId && t.amount < 0)
      .map((t) => t.date.slice(0, 10))
      .sort(),
    ["2025-02-01", "2025-03-01"],
  );
  assert.equal(r.dailyBalances.at(-1)!.accounts.checking, 500);
  const skipped = r.audit.filter((a) => a.kind === "transfer-skipped");
  assert.equal(skipped.length, 10);
  assert.ok(
    skipped.every((a) => a.message.includes("minimum balance before transfer")),
  );
  assert.equal(r.summary.assets, 20700);
});

test("the default only requires full funding; custom minimums are rechecked after earlier transfers", () => {
  const f = fixture(),
    c = f.configuration;
  c.accounts[0].openingBalance = 500;
  c.accountTransfers = [rule({ amount: 500 })];
  assert.equal(run(f).transactions.length, 2);
  c.accountTransfers = [
    rule({ minimumSourceBalance: 500 }),
    rule({ id: "second", minimumSourceBalance: 500 }),
  ];
  const r = run(f);
  assert.equal(
    r.transactions.filter((t) => t.transferRuleId === "scheduled").length,
    2,
  );
  assert.equal(
    r.transactions.filter((t) => t.transferRuleId === "second").length,
    0,
  );
  assert.equal(
    r.audit.find((a) => a.kind === "transfer-skipped")!.transferRuleId,
    "second",
  );
  c.accountTransfers = [
    { ...triggered("balance-below", 600), minimumSourceBalance: 1000 },
  ];
  assert.equal(run(f).transactions.length, 2);
});

test("scheduled recurrence posts only within the simulation and inclusive stop date", () => {
  const f = fixture();
  f.configuration.accountTransfers = [
    rule({
      startDate: "2024-01-31",
      recurrence: "monthly",
      endDate: "2025-03-31",
    }),
    rule({ id: "past-once", startDate: "2024-01-01" }),
    rule({ id: "disabled", enabled: false }),
  ];
  const dates = run(f)
    .transactions.filter((t) => t.amount < 0)
    .map((t) => t.date.slice(0, 10))
    .sort();
  assert.deepEqual(dates, ["2025-01-31", "2025-02-28", "2025-03-31"]);
});

test("balance triggers fire once per crossing and wait out their cooldown", () => {
  const r = new TransferRuntime([triggered("balance-below", 500, 7)]);
  assert.equal(r.due(snapshot()).length, 1);
  assert.equal(r.due(snapshot({ date: "2025-01-02" })).length, 0);
  assert.equal(
    r.due(snapshot({ date: "2025-01-03", balances: { checking: 600 } })).length,
    0,
  );
  assert.equal(r.due(snapshot({ date: "2025-01-04" })).length, 0);
  assert.equal(r.due(snapshot({ date: "2025-01-08" })).length, 1);
  const high = new TransferRuntime([triggered("balance-above", 100)]);
  assert.equal(high.due(snapshot()).length, 0);
  assert.equal(
    high.due(snapshot({ date: "2025-01-02", balances: { checking: 101 } }))
      .length,
    1,
  );
});

test("above-average balance uses prior balances and handles negative averages", () => {
  const r = new TransferRuntime([triggered("balance-above-average", 20)]);
  assert.equal(r.due(snapshot({ balances: { checking: 120 } })).length, 0);
  assert.equal(
    r.due(snapshot({ date: "2025-01-02", balances: { checking: 121 } })).length,
    1,
  );
  const negative = new TransferRuntime([
    triggered("balance-above-average", 20),
  ]);
  assert.equal(
    negative.due(
      snapshot({
        balances: { checking: -70 },
        averageBalances: { checking: -100 },
      }),
    ).length,
    1,
  );
});

test("above-average income ignores transfers and fires only on receipts once per threshold crossing", () => {
  const r = new TransferRuntime([triggered("income-above-average", 20)]);
  assert.equal(r.due(snapshot({ monthlyIncome: 1300 })).length, 0);
  assert.equal(
    r.due(
      snapshot({ date: "2025-01-02", monthlyIncome: 1300, incomeToday: 1300 }),
    ).length,
    1,
  );
  assert.equal(
    r.due(
      snapshot({ date: "2025-01-03", monthlyIncome: 1400, incomeToday: 100 }),
    ).length,
    0,
  );
  assert.equal(r.due(snapshot({ date: "2025-02-01" })).length, 0);
  assert.equal(
    r.due(
      snapshot({ date: "2025-02-02", monthlyIncome: 1400, incomeToday: 1400 }),
    ).length,
    1,
  );
});

test("trigger snapshots do not cascade within one day and future rules cannot look ahead", () => {
  const f = fixture(),
    c = f.configuration;
  c.accounts[0].openingBalance = 100;
  c.accountTransfers = [
    rule({ amount: 200, fromAccount: "savings", toAccount: "checking" }),
    {
      ...triggered("balance-above", 200),
      id: "condition",
      amount: 50,
      toAccount: "investment",
    },
  ];
  const r = run(f);
  assert.deepEqual(
    r.transactions
      .filter((t) => t.transferRuleId === "condition" && t.amount < 0)
      .map((t) => t.date.slice(0, 10)),
    ["2025-01-02"],
  );
});

test("transfer averages use prior closing balances and complete monthly income including zero months", () => {
  const f = fixture(),
    c = f.configuration;
  c.incomes = [
    {
      ...bundled.configuration.incomes[0],
      id: "salary",
      amount: 1000,
      day: 1,
      annualGrowth: 0,
      amountVariation: 0,
      frequencyVariation: 0,
    },
    {
      ...bundled.configuration.incomes[0],
      id: "bonus",
      amount: 500,
      frequency: "once",
      startDate: "2025-04-15",
      main: false,
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
    },
  ];
  c.accountTransfers = [
    { ...triggered("income-above-average", 20), amount: 50 },
    { ...triggered("balance-above-average", 5), id: "balance", amount: 10 },
  ];
  const r = run(f);
  assert.deepEqual(
    r.transactions
      .filter((t) => t.transferRuleId === "scheduled" && t.amount < 0)
      .map((t) => t.date.slice(0, 10)),
    ["2025-04-15"],
  );
  assert.ok(
    r.transactions.some(
      (t) => t.transferRuleId === "balance" && t.date.startsWith("2025-01-01"),
    ),
  );
  c.incomes[0].endDate = "2025-01-31";
  // February and March contribute zero, so April's 500 exceeds 120% of (1000 + 0 + 0) / 3.
  assert.deepEqual(
    run(f)
      .transactions.filter(
        (t) => t.transferRuleId === "scheduled" && t.amount < 0,
      )
      .map((t) => t.date.slice(0, 10)),
    ["2025-04-15"],
  );
});

test("configured transfers are preserved under modes and influence daily account balances", () => {
  const f = fixture();
  f.configuration.spendingModes = [
    newSpendingMode("survival", "survival", "2025-01-01"),
  ];
  f.configuration.accountTransfers = [
    rule({ amount: 100, fromAccount: "investment", toAccount: "savings" }),
  ];
  const r = run(f),
    pair = r.transactions.filter((t) => t.transferRuleId);
  assert.equal(pair.length, 2);
  assert.ok(pair.every((t) => !t.modeId));
  assert.equal(r.dailyBalances[0].accounts.investment, 9900);
});

test("transfer settings round-trip JSON and saved Undo/Redo, with identifiers in history exports", () => {
  const f = fixture(),
    original = structuredClone(f);
  f.configuration.accountTransfers = [
    rule({
      recurrence: "weekly",
      endDate: "2025-03-31",
      minimumSourceBalance: 5000,
    }),
    {
      ...triggered("balance-above-average", 10),
      id: "monitor",
      fromAccount: "investment",
      toAccount: "checking",
    },
  ];
  const exported = exportConfiguration(
    f.configuration,
    f.reference,
    f.assumptions,
    f.modelId,
  );
  const imported = parseConfiguration(JSON.stringify(exported));
  assert.deepEqual(
    imported.configuration.accountTransfers,
    f.configuration.accountTransfers,
  );
  assert.deepEqual(run(imported), run(f));
  const state = parseWorkspace(
    serializeWorkspace(editWorkspace(newWorkspace(original), f)),
  );
  assert.deepEqual(undoWorkspace(state).present, original);
  assert.deepEqual(redoWorkspace(undoWorkspace(state)).present, f);
  const history = JSON.stringify(exportHistory(run(f), f));
  assert.ok(history.includes('"transferRuleId":"scheduled"'));
  const renamed = structuredClone(f);
  renamed.configuration.accountTransfers![0].label = "Another label";
  assert.equal(
    financialFingerprint(f.configuration, f.reference, f.assumptions),
    financialFingerprint(
      renamed.configuration,
      renamed.reference,
      renamed.assumptions,
    ),
  );
});

test("currency conversion scales transfer money but retains relative trigger percentages", () => {
  const f = fixture();
  f.configuration.accountTransfers = [
    rule({ minimumSourceBalance: 1000 }),
    { ...triggered("balance-above-average", 20), id: "relative" },
  ];
  const p = previewCountryConversion(f, gb as CountryMerchantReference, {
    rate: 0.85,
  });
  assert.equal(p.configuration.accountTransfers![0].amount, 85);
  assert.equal(p.configuration.accountTransfers![0].minimumSourceBalance, 850);
  assert.equal(p.configuration.accountTransfers![0].trigger.threshold, 425);
  assert.equal(p.configuration.accountTransfers![1].trigger.threshold, 20);
});

test("invalid transfer directions, dates, thresholds, amounts and duplicate IDs are rejected", () => {
  for (const change of [
    (t: AccountTransfer) => {
      t.toAccount = t.fromAccount;
    },
    (t: AccountTransfer) => {
      t.fromAccount = "missing";
    },
    (t: AccountTransfer) => {
      t.startDate = "2025-02-30";
    },
    (t: AccountTransfer) => {
      t.endDate = "2024-12-31";
    },
    (t: AccountTransfer) => {
      t.amount = -1;
    },
    (t: AccountTransfer) => {
      t.amount = 1.001;
    },
    (t: AccountTransfer) => {
      t.minimumSourceBalance = -1;
    },
    (t: AccountTransfer) => {
      t.minimumSourceBalance = 1.001;
    },
    (t: AccountTransfer) => {
      t.timing = "triggered";
      t.trigger.account = "missing";
    },
    (t: AccountTransfer) => {
      t.timing = "triggered";
      t.trigger.kind = "balance-above-average";
      t.trigger.threshold = -1;
    },
    (t: AccountTransfer) => {
      t.trigger.cooldownDays = 0;
    },
  ]) {
    const f = fixture();
    f.configuration.accountTransfers = [rule()];
    change(f.configuration.accountTransfers[0]);
    assert.ok(
      validateScenario(f.configuration, f.reference, f.assumptions).length,
    );
  }
  const f = fixture();
  f.configuration.accountTransfers = [rule(), rule()];
  assert.throws(() => run(f));
});

test("empty transfer rules leave the baseline history unchanged", () => {
  const f = fixture(),
    before = run(f);
  f.configuration.accountTransfers = [];
  assert.deepEqual(run(f), before);
});

test("simplified mode conditions remove duplicate entry points while preserving distinct bounds and legacy behavior", () => {
  for (const key of [
    "date",
    "dateRange",
    "bonusReceived",
    "refundReceived",
    "unexpectedIncome",
  ])
    assert.ok(!modeConditionOptions.some(([id]) => id === key));
  const low = newModeCondition();
  assert.equal(uniqueModeConditions([low, { ...low }]).length, 1);
  const income = newModeCondition("incomeReceived");
  assert.equal(
    uniqueModeConditions([income, { ...income, incomeKind: "any" }]).length,
    1,
  );
  assert.equal(
    uniqueModeConditions([low, { ...low, operator: "gt" }]).length,
    2,
  );
  const s = {
    date: "2025-01-01",
    values: {},
    categorySpending: {},
    income: [
      {
        amount: 500,
        income: { kind: "bonus" as const, main: false, expected: false },
      },
    ],
  };
  assert.equal(
    matchesTrigger({ metric: "bonusReceived", operator: "gt", value: 100 }, s),
    matchesTrigger(
      {
        metric: "incomeReceived",
        operator: "gt",
        value: 100,
        incomeKind: "bonus",
      },
      s,
    ),
  );
});
