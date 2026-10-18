import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import bundled from "../specifications/configurations/nicolas.personia.json";
import lea from "../specifications/configurations/lea.personia.json";
import sarah from "../specifications/configurations/sarah.personia.json";
import michel from "../specifications/configurations/michel.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type {
  ConfigurationFile,
  PaymentCardType,
  PlannedEvent,
} from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import {
  newPaymentCard,
  paymentCardAccountKey,
} from "../src/config/payment-cards";
import { generate, financialFingerprint } from "../src/engine";
import { toMinor } from "../src/engine/money";
import { cardRepaymentDue } from "../src/engine/payment-cards";
import {
  exportConfiguration,
  parseConfiguration,
  exportHistory,
} from "../src/config/files";
import { validateScenario } from "../src/config/validation";
import {
  previewCountryConversion,
  applyCountryConversion,
} from "../src/config/conversion";
import {
  newWorkspace,
  editWorkspace,
  undoWorkspace,
  parseWorkspace,
  serializeWorkspace,
} from "../src/config/workspace";
import { CreditFacilities } from "../src/ui/CreditFacilities";
import { PaymentCards } from "../src/ui/PaymentCards";
import { History } from "../src/ui/History";

function scenario(type: PaymentCardType = "debit") {
  const file = modernizeScenario(bundled as ConfigurationFile);
  const c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.accounts = [
    {
      key: "checking",
      name: "Current",
      bank: "Synthetic",
      type: "checking",
      openingBalance: 1000,
    },
  ];
  c.incomes = [];
  c.charges = [];
  c.otherTaxes = [];
  c.incomeTax!.enabled = false;
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((key) => [key, 0]));
  c.budgetOverrides = {};
  c.merchantOverrides = {};
  c.events = Object.fromEntries(
    Object.keys(c.events).map((key) => [key, false]),
  );
  c.autoSavings = c.autoTopup = c.overdraft = false;
  c.financing.consumerEnabled = c.financing.cardEnabled = false;
  c.paymentCards = [newPaymentCard(type, "test-card")];
  c.defaultPaymentCardId = "test-card";
  c.plannedEvents = [trip("2025-01-15")];
  return file;
}
function trip(startDate: string, amount = 100): PlannedEvent {
  return {
    ...(structuredClone(
      templates.find((e) => e.type === "travel-domestic")!,
    ) as PlannedEvent),
    id: `trip-${startDate}`,
    startDate,
    durationDays: 1,
    amount,
    travelers: 1,
    mandatory: true,
    enabled: true,
  };
}
const run = (file: ConfigurationFile) =>
  generate(file.configuration, file.reference, file.assumptions);
function reconcile(result: ReturnType<typeof run>) {
  const balances = new Map(
    result.accounts.map((a) => [
      a.key,
      toMinor(a.openingBalance, result.currencyDigits),
    ]),
  );
  for (const op of [...result.transactions].reverse()) {
    balances.set(op.accountKey, balances.get(op.accountKey)! + op.amountMinor);
    assert.equal(balances.get(op.accountKey), op.balanceAfterMinor);
  }
  for (const a of result.accounts)
    assert.equal(
      balances.get(a.key),
      toMinor(a.closingBalance, result.currencyDigits),
    );
  for (const day of result.dailyBalances) {
    const cardDebt = result.accounts
      .filter((a) => a.paymentCardId)
      .reduce(
        (sum, a) =>
          sum +
          Math.max(0, -toMinor(day.accounts[a.key], result.currencyDigits)),
        0,
      );
    const bankAssets = result.accounts
      .filter((a) => !a.paymentCardId)
      .reduce(
        (sum, a) => sum + toMinor(day.accounts[a.key], result.currencyDigits),
        0,
      );
    assert.equal(toMinor(day.assets, result.currencyDigits), bankAssets);
    assert.equal(toMinor(day.debt, result.currencyDigits), cardDebt);
    assert.equal(
      toMinor(day.netAssets, result.currencyDigits),
      bankAssets - cardDebt,
    );
  }
  assert.equal(
    result.monthlyTotals.reduce(
      (sum, m) => sum + toMinor(m.expenses, result.currencyDigits),
      0,
    ),
    toMinor(result.summary.expenses, result.currencyDigits),
  );
  for (const op of result.transactions.filter((op) => op.transferId)) {
    const pair = result.transactions.filter(
      (other) => other.transferId === op.transferId,
    );
    assert.equal(pair.length, 2);
    assert.equal(pair[0].amountMinor + pair[1].amountMinor, 0);
  }
}

test("debit is the default; debit purchases use current cash and create no card account", () => {
  const card = newPaymentCard();
  assert.equal(card.type, "debit");
  assert.equal(card.authorizedOverdraft, 0);
  const file = scenario();
  const result = run(file);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.summary.closingBalance, 900);
  assert.equal(result.summary.expenses, 100);
  assert.ok(
    result.transactions.every(
      (op) => op.accountKey === "checking" && op.paymentCardId === "test-card",
    ),
  );
  reconcile(result);
});

test("deferred purchases use a zero-opening ledger; monthly settlement is a paired transfer and excludes charges and taxes", () => {
  const file = scenario("deferred-debit");
  const c = file.configuration;
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 20,
      day: 17,
      categoryId: 273,
      enabled: true,
    },
  ];
  c.otherTaxes = [
    {
      id: "tax",
      label: "Tax",
      amount: 50,
      enabled: true,
      frequency: "annual",
      day: 20,
      month: 1,
    },
  ];
  const result = run(file);
  const key = paymentCardAccountKey("test-card");
  const account = result.accounts.find((a) => a.key === key)!;
  assert.equal(account.type, "deferred-card");
  assert.equal(account.openingBalance, 0);
  const jan15 = result.dailyBalances.find((day) => day.date === "2025-01-15")!;
  assert.equal(jan15.checking, 1000);
  assert.equal(jan15.accounts[key], -100);
  assert.equal(jan15.assets, 1000);
  assert.equal(jan15.debt, 100);
  assert.equal(jan15.netAssets, 900);
  const payments = result.transactions.filter(
    (op) => op.accountKey === key && op.amount > 0,
  );
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 100);
  assert.equal(payments[0].date.slice(0, 10), "2025-02-01");
  assert.ok(
    result.transactions
      .filter((op) => ["tax", "recurring"].includes(op.simulationKind))
      .every((op) => op.accountKey === "checking" && !op.paymentCardId),
  );
  assert.equal(result.summary.expenses, 390);
  assert.equal(result.summary.closingBalance, 610);
  assert.equal(account.closingBalance, 0);
  assert.equal(result.summary.income, 0);
  reconcile(result);
});

test("deferred bills clamp month ends and leave the final month's spending outstanding beyond the horizon", () => {
  for (const [year, expected] of [
    [2024, "2024-02-29"],
    [2025, "2025-02-28"],
  ] as const) {
    const file = scenario("deferred-debit");
    file.configuration.startDate = `${year}-01-01`;
    file.configuration.paymentCards![0].settlementDay = 31;
    file.configuration.plannedEvents = [trip(`${year}-01-31`)];
    const result = run(file);
    const payment = result.transactions.find(
      (op) => op.accountKey.startsWith("card:") && op.amount > 0,
    )!;
    assert.equal(payment.date.slice(0, 10), expected);
    reconcile(result);
  }
  const file = scenario("deferred-debit");
  file.configuration.plannedEvents = [trip("2025-12-31")];
  const result = run(file);
  assert.equal(result.summary.closingBalance, 1000);
  assert.equal(result.summary.debt, 100);
  assert.equal(
    result.accounts.find((a) => a.paymentCardId)?.closingBalance,
    -100,
  );
  assert.ok(
    result.transactions.every((op) => op.date.slice(0, 10) <= result.endDate),
  );
  reconcile(result);
});

test("credit defaults to 20% yearly and applies monthly interest to the balance after percentage repayment", () => {
  const file = scenario("credit");
  file.configuration.plannedEvents = [
    {
      ...(structuredClone(
        templates.find((event) => event.type === "exceptional")!,
      ) as PlannedEvent),
      id: "one-off-purchase",
      startDate: "2025-01-15",
      amount: 100,
      category: "shoppingOthers",
      enabled: true,
      mandatory: true,
    },
  ];
  const card = file.configuration.paymentCards![0];
  assert.equal(card.creditAnnualRate, 20);
  assert.equal(card.repaymentPercent, 10);
  const result = run(file);
  assert.equal(
    result.transactions.find((op) => op.eventId === "one-off-purchase")
      ?.paymentCardId,
    "test-card",
  );
  const feb = result.transactions.filter((op) =>
    op.date.startsWith("2025-02-01"),
  );
  assert.equal(
    feb.find((op) => op.accountKey.startsWith("card:") && op.amount > 0)
      ?.amount,
    10,
  );
  assert.equal(
    feb.find((op) => op.simulationKind === "card-interest")?.amount,
    -1.5,
  );
  const day = result.dailyBalances.find((day) => day.date === "2025-02-01")!;
  assert.equal(day.checking, 990);
  assert.equal(day.debt, 91.5);
  assert.equal(day.netAssets, 898.5);
  reconcile(result);
});

test("fixed credit repayments cap the final refund at the outstanding amount and stop interest once paid", () => {
  const file = scenario("credit");
  Object.assign(file.configuration.paymentCards![0], {
    repaymentMode: "amount",
    repaymentAmount: 25,
  });
  const result = run(file);
  const interest = result.transactions
    .filter((op) => op.simulationKind === "card-interest")
    .reduce((sum, op) => sum - op.amountMinor, 0);
  assert.equal(interest, 259);
  assert.equal(result.summary.debt, 0);
  assert.equal(result.summary.closingBalance, 897.41);
  assert.equal(result.summary.expenses, 102.59);
  assert.ok(
    result.transactions
      .filter((op) => op.accountKey.startsWith("card:"))
      .every((op) => op.balanceAfterMinor <= 0),
  );
  assert.equal(
    result.transactions.find(
      (op) => op.accountKey.startsWith("card:") && op.amount > 0,
    )?.amount,
    2.59,
  );
  assert.ok(
    !result.transactions.some(
      (op) => op.simulationKind === "card-interest" && op.date >= "2025-06-01",
    ),
  );
  reconcile(result);
});

test("weekly, quarterly and yearly refund schedules retain weekday/month anchors and exact minor-unit repayments", () => {
  const file = scenario("credit");
  const card = file.configuration.paymentCards![0];
  Object.assign(card, {
    creditAnnualRate: 0,
    repaymentFrequency: "weekly",
    repaymentDay: 1,
    repaymentPercent: 50,
  });
  const weekly = run(file);
  const first = [...weekly.transactions]
    .reverse()
    .find((op) => op.accountKey.startsWith("card:") && op.amount > 0)!;
  assert.equal(first.date.slice(0, 10), "2025-01-20");
  assert.equal(first.amount, 50);
  assert.equal(weekly.summary.debt, 0);
  reconcile(weekly);
  for (const [frequency, remaining] of [
    ["quarterly", 10],
    ["annual", 70],
  ] as const) {
    Object.assign(card, {
      repaymentFrequency: frequency,
      repaymentDay: 1,
      repaymentMonth: frequency === "annual" ? 7 : 1,
      repaymentMode: "amount",
      repaymentAmount: 30,
    });
    const result = run(file);
    assert.equal(result.summary.debt, remaining);
    reconcile(result);
  }
  card.repaymentFrequency = "monthly";
  card.repaymentDay = 31;
  assert.equal(cardRepaymentDue(card, "2024-02-29"), true);
  assert.equal(cardRepaymentDue(card, "2025-02-28"), true);
  assert.equal(cardRepaymentDue(card, "2025-02-27"), false);
});

test("authorized overdrafts limit card debits and accrue only card-related interest, not recurring or tax debt", () => {
  const file = scenario();
  const c = file.configuration;
  c.accounts[0].openingBalance = 0;
  const declined = run(file);
  assert.equal(declined.transactions.length, 0);
  assert.ok(declined.audit.some((entry) => entry.kind === "card-declined"));
  Object.assign(c.paymentCards![0], {
    authorizedOverdraft: 100,
    overdraftAnnualRate: 36.5,
  });
  const result = run(file);
  assert.equal(
    result.transactions.find(
      (op) =>
        op.simulationKind === "card-overdraft-interest" &&
        op.date.startsWith("2025-01-31"),
    )?.amount,
    -1.7,
  );
  reconcile(result);
  c.plannedEvents = [];
  c.charges = [
    {
      id: "rent",
      name: "Rent",
      amount: 100,
      day: 1,
      categoryId: 273,
      enabled: true,
    },
  ];
  assert.ok(
    !run(file).transactions.some(
      (op) => op.simulationKind === "card-overdraft-interest",
    ),
  );
});

test("checking income repays card overdraft before the next monthly interest debit", () => {
  const file = scenario();
  const c = file.configuration;
  c.accounts[0].openingBalance = 0;
  Object.assign(c.paymentCards![0], {
    authorizedOverdraft: 100,
    overdraftAnnualRate: 36.5,
  });
  c.incomes = [
    {
      ...structuredClone(bundled.configuration.incomes[0]),
      amount: 100,
      frequency: "once",
      startDate: "2025-01-20",
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
    },
  ];
  const result = run(file);
  assert.equal(
    result.transactions.find(
      (op) =>
        op.simulationKind === "card-overdraft-interest" &&
        op.date.startsWith("2025-01-31"),
    )?.amount,
    -0.5,
  );
  reconcile(result);
});

test("deferred unpaid bills stay on their ledger; authorized current-account overdraft can fund settlement", () => {
  const file = scenario("deferred-debit");
  file.configuration.accounts[0].openingBalance = 50;
  const partial = run(file);
  assert.equal(partial.summary.closingBalance, 0);
  assert.equal(partial.summary.debt, 50);
  assert.ok(
    partial.audit.some((entry) => entry.kind === "card-payment-shortfall"),
  );
  reconcile(partial);
  file.configuration.paymentCards![0].authorizedOverdraft = 75;
  const paid = run(file);
  assert.equal(paid.summary.closingBalance, -50);
  assert.equal(paid.summary.debt, 0);
  reconcile(paid);
});

test("surplus savings retain the cash needed for the next deferred card bill", () => {
  const file = scenario("deferred-debit");
  const c = file.configuration;
  c.accounts[0].openingBalance = 0;
  c.buffer = 0;
  c.autoSavings = true;
  c.savingAggression = 1;
  c.accounts.push({
    key: "saving",
    name: "Savings",
    bank: "Synthetic",
    type: "savings",
    openingBalance: 0,
    annualRate: 0,
    depositRank: 1,
    withdrawalRank: 1,
  });
  c.incomes = [
    {
      ...structuredClone(bundled.configuration.incomes[0]),
      amount: 1000,
      frequency: "once",
      startDate: "2025-01-16",
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
    },
  ];
  const result = run(file);
  const paidDay = result.dailyBalances.find(
    (day) => day.date === "2025-01-16",
  )!;
  assert.equal(paidDay.checking, 100);
  assert.equal(paidDay.accounts.saving, 900);
  const billDay = result.dailyBalances.find(
    (day) => day.date === "2025-02-01",
  )!;
  assert.equal(billDay.checking, 0);
  assert.equal(billDay.accounts.saving, 900);
  assert.equal(billDay.debt, 0);
  reconcile(result);
});

test("all four supplied personas reconcile every account and JSON scope for all three card types", () => {
  for (const model of [bundled, lea, sarah, michel]) {
    for (const type of ["debit", "deferred-debit", "credit"] as const) {
      const file = modernizeScenario(model as ConfigurationFile);
      file.configuration.years = 1;
      file.configuration.financing.consumerEnabled =
        file.configuration.financing.cardEnabled = false;
      file.configuration.paymentCards = [newPaymentCard(type, "persona-card")];
      file.configuration.defaultPaymentCardId = "persona-card";
      const before = structuredClone(file);
      const result = run(file);
      reconcile(result);
      for (const key of [undefined, ...result.accounts.map((a) => a.key)]) {
        const statement = exportHistory(result, file, key);
        assert.deepEqual(JSON.parse(JSON.stringify(statement)), statement);
        assert.equal(
          statement.included.accounts.length,
          key ? 1 : result.accounts.length,
        );
      }
      assert.deepEqual(file, before);
    }
  }
});

test("all configured cards keep separate account identity while only the selected card receives purchases", () => {
  const file = scenario("deferred-debit");
  const c = file.configuration;
  c.paymentCards!.push(newPaymentCard("credit", "other"));
  c.defaultPaymentCardId = "other";
  const result = run(file);
  assert.equal(result.accounts.length, 3);
  assert.equal(
    result.accounts.find((a) => a.paymentCardId === "test-card")
      ?.closingBalance,
    0,
  );
  assert.ok(
    result.transactions
      .filter((op) => op.simulationKind === "travel")
      .every((op) => op.paymentCardId === "other"),
  );
  const before = financialFingerprint(c, file.reference, file.assumptions);
  c.paymentCards![1].label = "Renamed card";
  assert.equal(
    financialFingerprint(c, file.reference, file.assumptions),
    before,
  );
  const statement = exportHistory(result, file, paymentCardAccountKey("other"));
  assert.equal(statement.included.accounts[0].name, "Renamed card");
  assert.equal(statement.included.accounts[0].type, "credit-card");
  assert.equal(statement.included.accounts[0].openingBalance, 0);
  assert.ok(
    statement.data.every((op) => op.parsedData.paymentCardId === "other"),
  );
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(statement)));
  reconcile(result);
});

test("card configuration, saved Undo history and currency conversion retain financial settings and reproduce statements", () => {
  const file = scenario("credit");
  const before = structuredClone(file);
  const exported = exportConfiguration(
    file.configuration,
    file.reference,
    file.assumptions,
    file.modelId,
  );
  const restored = parseConfiguration(JSON.stringify(exported));
  assert.deepEqual(run(restored), run(file));
  let state = newWorkspace(file);
  const changed = structuredClone(file);
  changed.configuration.paymentCards![0].creditAnnualRate = 0;
  state = parseWorkspace(serializeWorkspace(editWorkspace(state, changed)));
  assert.deepEqual(undoWorkspace(state).present, file);
  const target = structuredClone(file.reference);
  target.id = "gb.cards.v1";
  target.countryCode = "GB";
  target.currency = "GBP";
  target.locale = "en-GB";
  target.timeZone = "Europe/London";
  file.configuration.paymentCards![0].authorizedOverdraft = 200;
  const preview = previewCountryConversion(file, target, { rate: 0.5 });
  const converted = applyCountryConversion(preview);
  assert.equal(
    converted.configuration.paymentCards![0].authorizedOverdraft,
    100,
  );
  assert.equal(converted.configuration.paymentCards![0].repaymentAmount, 50);
  assert.equal(converted.configuration.paymentCards![0].creditAnnualRate, 20);
  assert.equal(converted.configuration.paymentCards![0].repaymentPercent, 10);
  before.configuration.paymentCards![0].authorizedOverdraft = 200;
  assert.deepEqual(file, before);
});

test("card validation rejects unsafe identities, unknown selected cards, invalid schedules and money precision", () => {
  const file = scenario("credit");
  const c = file.configuration;
  for (const patch of [
    { authorizedOverdraft: 0.001 },
    { creditAnnualRate: -1 },
    { settlementDay: 32 },
    { repaymentFrequency: "weekly", repaymentDay: 8 },
    { id: "__proto__" },
  ] as const) {
    const bad = structuredClone(c);
    Object.assign(bad.paymentCards![0], patch);
    assert.ok(
      validateScenario(bad, file.reference, file.assumptions).length > 0,
    );
  }
  c.defaultPaymentCardId = "missing";
  assert.ok(
    validateScenario(c, file.reference, file.assumptions).some((issue) =>
      issue.path.endsWith("defaultPaymentCardId"),
    ),
  );
});

test("Accounts offers the three payment-card types and Credit facilities no longer offers a new credit-card loan", () => {
  const file = scenario("credit");
  const cards = renderToStaticMarkup(
    React.createElement(PaymentCards, {
      config: file.configuration,
      update() {},
    }),
  );
  for (const label of [
    "Debit card",
    "Deferred debit card",
    "Credit card",
    "Authorized overdraft",
    "Repayment frequency",
  ])
    assert.ok(cards.includes(label));
  const loans = renderToStaticMarkup(
    React.createElement(CreditFacilities, {
      config: file.configuration,
      update() {},
    }),
  );
  assert.ok(!loans.includes('<option value="card"'));
  const history = renderToStaticMarkup(
    React.createElement(History, {
      file,
      result: run(file),
      account: paymentCardAccountKey("test-card"),
      current: true,
      onAccount() {},
      onExport() {},
    }),
  );
  assert.ok(history.includes("Credit card"));
});
