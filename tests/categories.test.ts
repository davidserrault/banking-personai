import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConfigurationFile, Income } from "../src/domain/types";
import {
  categories,
  categoryGroups,
  categoryById,
  categoryByKey,
  categoryMetadata,
  matchesCategory,
  spendingCategories,
} from "../src/domain/categories";
import { generate, merchantRates, monthlyEnvelopes } from "../src/engine";
import {
  exportConfiguration,
  exportHistory,
  parseConfiguration,
  parseMerchantReference,
  validateScenario,
} from "../src/config";
import { referenceHash } from "../src/config/canonical";
import {
  serializeWorkspace,
  parseWorkspace,
  newWorkspace,
  editWorkspace,
} from "../src/config/workspace";
import { CategoryField } from "../src/ui/CategoryField";
import { CategoryReference } from "../src/ui/CategoryReference";
import { Reference } from "../src/ui/Reference";
import { History } from "../src/ui/History";
import { BudgetSettings } from "../src/ui/BudgetSettings";
import { modernizeScenario } from "../src/config/profile";
const read = (name: string): ConfigurationFile =>
  JSON.parse(
    readFileSync(
      new URL(
        `../specifications/configurations/${name}.personia.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
function empty() {
  const f = modernizeScenario(read("nicolas")),
    c = f.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.accounts = [
    {
      key: "checking",
      type: "checking",
      name: "Current",
      bank: "Synthetic",
      openingBalance: 1000000,
    },
  ];
  c.charges = [];
  c.incomes = [];
  c.plannedEvents = [];
  c.creditFacilities = [];
  c.spendingModes = [];
  c.accountTransfers = [];
  c.budgets = {};
  c.budgetOverrides = {};
  c.merchantOverrides = {};
  c.autoSavings = false;
  c.autoTopup = false;
  c.incomeTax!.enabled = false;
  c.otherTaxes = [];
  c.financing.consumerEnabled = c.financing.cardEnabled = false;
  c.events = Object.fromEntries(Object.keys(c.events).map((k) => [k, false]));
  return f;
}
test("the supplied tree retains all 127 entries in exactly 15 groups with stable Bridge IDs", () => {
  assert.equal(categoryGroups.length, 15);
  assert.equal(categories.length, 127);
  const expected = new Map([
    [165, 10],
    [164, 8],
    [171, 5],
    [166, 19],
    [167, 8],
    [170, 11],
    [168, 5],
    [163, 6],
    [161, 10],
    [2, 15],
    [160, 6],
    [315, 5],
    [162, 9],
    [159, 6],
    [303, 4],
  ]);
  assert.equal(new Set(categories.map((c) => c.id)).size, 127);
  assert.equal(new Set(categories.map((c) => c.key)).size, 127);
  for (const [id, count] of expected)
    assert.equal(categories.filter((c) => c.parentId === id).length, count);
  assert.equal(categoryById[1].name, "Uncategorized");
  assert.equal(categoryById[79].name, "Banking fees and charges");
  assert.equal(categoryById[84].name, "Auto & Transport - Others");
  assert.equal(categoryById[756587].name, "Payment incidents");
  for (const label of [
    "Pension",
    "Rent",
    "Salaries",
    "Savings",
    "Internal transfer",
  ]) {
    const pair = categories.filter((c) => c.name === label);
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0].id, pair[1].id);
    assert.notEqual(pair[0].parentId, pair[1].parentId);
  }
});
test("every expense leaf can be used for a recurring charge, including six-digit IDs", () => {
  const expenses = categories.filter((c) => c.parentId !== 2);
  for (let start = 0; start < expenses.length; start += 100) {
    const f = empty();
    f.configuration.charges = expenses.slice(start, start + 100).map((c) => ({
      id: c.key,
      name: c.name,
      amount: 1,
      day: 1,
      enabled: true,
      categoryId: c.id,
    }));
    assert.deepEqual(
      validateScenario(f.configuration, f.reference, f.assumptions),
      [],
    );
    const result = generate(f.configuration, f.reference, f.assumptions);
    for (const c of expenses.slice(start, start + 100)) {
      const rows = result.transactions.filter((t) => t.categoryId === c.id);
      assert.equal(rows.length, 12, c.name);
      assert.ok(
        rows.every(
          (t) =>
            t.category === c.key &&
            t.parentCategoryId === c.parentId &&
            t.amountMinor === -100,
        ),
      );
    }
  }
});
test("all 15 income leaves post with their own ID and cannot be used for expenses or purchase budgets", () => {
  const f = empty();
  f.configuration.incomes = categories
    .filter((c) => c.parentId === 2)
    .map(
      (c, i): Income => ({
        id: c.key,
        label: c.name,
        amount: 10,
        frequency: "once",
        day: 1,
        month: 1,
        amountVariation: 0,
        frequencyVariation: 0,
        annualGrowth: 0,
        main: i === 0,
        enabled: true,
        categoryId: c.id,
      }),
    );
  const result = generate(f.configuration, f.reference, f.assumptions);
  assert.equal(result.transactions.length, 15);
  for (const t of result.transactions) assert.equal(t.parentCategoryId, 2);
  const exported = exportHistory(result, f);
  assert.equal(exported.included.categories.length, 15);
  assert.equal(exported.meta.categorySystem.id, "bridge");
  const invalid = empty();
  invalid.configuration.charges = [
    {
      id: "bad",
      name: "Salary",
      amount: 1,
      day: 1,
      enabled: true,
      categoryId: 230,
    },
  ];
  assert.ok(
    validateScenario(
      invalid.configuration,
      invalid.reference,
      invalid.assumptions,
    ).some((i) => i.path.includes("categoryId")),
  );
  invalid.configuration.charges = [];
  invalid.configuration.budgets.salary = 100;
  assert.ok(
    validateScenario(
      invalid.configuration,
      invalid.reference,
      invalid.assumptions,
    ).some((i) => i.path.includes("budgets.salary")),
  );
});
for (const name of ["andre", "nicolas", "lea", "sarah", "michel"] as const) {
  test(`${name}: generated and exported categories have consistent leaf and parent IDs`, () => {
    const f = read(name);
    const r = generate(f.configuration, f.reference, f.assumptions);
    const history = exportHistory(r, f);
    for (let i = 0; i < r.transactions.length; i++) {
      const t = r.transactions[i],
        c = categoryById[t.categoryId];
      assert.ok(c);
      assert.equal(t.category, c.key);
      assert.equal(t.parentCategoryId, c.parentId);
      const out = history.data[i];
      assert.deepEqual(out.category, categoryMetadata(c.id));
      assert.equal(out.parentCategoryId, c.parentId);
      assert.equal(out.parsedData.categoryLabel, c.name);
    }
    assert.ok(
      r.transactions
        .filter((t) => t.simulationKind === "transfer" && t.amount < 0)
        .every((t) => t.categoryId === 326 || t.categoryId === 191),
    );
    assert.ok(
      r.transactions
        .filter((t) => t.simulationKind === "transfer" && t.amount > 0)
        .every((t) => t.categoryId === 282),
    );
    for (const account of r.accounts) {
      const statement = exportHistory(r, f, account.key);
      assert.equal(
        Math.round(account.openingBalance * 100) +
          statement.data.reduce((s, t) => s + t.amountMinor, 0),
        Math.round(account.closingBalance * 100),
      );
    }
    const saved = exportConfiguration(
      f.configuration,
      f.reference,
      f.assumptions,
      f.modelId,
    );
    assert.deepEqual(parseConfiguration(JSON.stringify(saved)), saved);
  });
}
// Small, invented inputs keep migration coverage independent of archived persona files.
function legacyScenario(): ConfigurationFile {
  const f = empty();
  const c = f.configuration;
  c.id = "persona.migration-test";
  c.name = "Migration test";
  c.costOfLiving = 1;
  c.budgets = { coffee: 30, travel: 20 };
  c.budgetOverrides = { ...c.budgets };
  c.preferredMerchants = [];
  c.inflation = { rate: 0, period: "yearly" };
  c.seasonality.enabled = false;
  c.charges = [
    {
      id: "test-charge",
      name: "Test charge",
      amount: 1,
      day: 1,
      categoryId: 79,
      enabled: true,
    },
  ];
  c.incomes = [
    {
      id: "test-income",
      label: "Test income",
      amount: 10,
      frequency: "once",
      day: 1,
      month: 1,
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
      main: true,
      enabled: true,
    },
  ];
  delete c.categorySystem;
  f.modelId = "custom";
  f.assumptions = {
    bankingCountry: null,
    consumptionCountry: null,
    seasonalityCountry: null,
    sources: [],
  };
  f.reference.id = "synthetic-migration-reference";
  f.reference.name = "Synthetic migration reference";
  f.reference.sources = [
    {
      title: "Synthetic test catalog",
      note: "Invented inputs for migration tests.",
    },
  ];
  f.reference.merchants = [
    { id: 1, name: "Test coffee", category: "coffee", mean: 5, regions: ["*"] },
    { id: 2, name: "Test train", category: "travel", mean: 10, regions: ["*"] },
  ];
  delete f.reference.categorySystem;
  delete f.reference.settings;
  c.referenceId = f.reference.id;
  f.referenceHash = referenceHash(f.reference);
  return f;
}
test("a small synthetic legacy scenario preserves merchant costs, frequencies and total budget during migration", () => {
  const f = parseConfiguration(JSON.stringify(legacyScenario()));
  const rates = merchantRates(f.configuration, f.reference, f.assumptions);
  assert.deepEqual(
    rates.map((r) => [r.merchant.id, r.mean, r.frequency]),
    [
      [1, 5, 6],
      [2, 10, 2],
    ],
  );
  const budgets = monthlyEnvelopes(f.configuration, f.reference, f.assumptions);
  assert.equal(
    Object.values(budgets).reduce((sum, value) => sum + value, 0),
    50,
  );
  assert.equal(f.configuration.charges[0].categoryId, 313);
  assert.equal(f.reference.categorySystem, "bridge");
});
test("legacy numeric ID collisions migrate once, without mutating imports or accepting a forged hash", () => {
  const raw = legacyScenario(),
    before = structuredClone(raw);
  const migrated = parseConfiguration(JSON.stringify(raw));
  assert.deepEqual(raw, before);
  assert.equal(migrated.configuration.categorySystem, "bridge");
  const known = new Map(
    migrated.reference.merchants.map((m) => [m.name, m.category]),
  );
  assert.equal(known.get("Test coffee"), "coffee");
  assert.equal(known.get("Test train"), "trainTicket");
  assert.equal(
    categoryByKey[
      migrated.reference.merchants.find((m) => m.name === "Test coffee")!
        .category
    ].id,
    313,
  );
  assert.deepEqual(parseConfiguration(JSON.stringify(migrated)), migrated);
  raw.referenceHash = "0".repeat(64);
  assert.throws(() => parseConfiguration(JSON.stringify(raw)), /hash/);
  const invalid = read("nicolas");
  invalid.configuration.charges[0].categoryId = 165;
  assert.throws(() => parseConfiguration(JSON.stringify(invalid)), /category/);
  const reference = parseMerchantReference(JSON.stringify(before.reference));
  assert.equal(reference.categorySystem, "bridge");
  assert.ok(reference.merchants.every((m) => categoryByKey[m.category]));
});
test("legacy saved work migrates its latest edits and does not replay old category patches", () => {
  const old = legacyScenario();
  const edited = structuredClone(old);
  edited.configuration.incomes[0].amount += 15;
  const workspace = editWorkspace(newWorkspace(old), edited);
  const restored = parseWorkspace(serializeWorkspace(workspace));
  assert.equal(restored.present.configuration.categorySystem, "bridge");
  assert.equal(
    restored.present.configuration.incomes[0].amount,
    edited.configuration.incomes[0].amount,
  );
  assert.equal(restored.past.length, 0);
});
test("main-category selection includes only its children; grouped editors keep duplicate names distinct", () => {
  assert.ok(matchesCategory("salary", "group:2"));
  assert.ok(!matchesCategory("businessSalaries", "group:2"));
  assert.ok(matchesCategory("rent", "group:161"));
  assert.ok(!matchesCategory("rentalIncome", "group:161"));
  const markup = renderToStaticMarkup(
    React.createElement(CategoryField, {
      label: "Category",
      numeric: true,
      value: 230,
      onChange: () => {},
    }),
  );
  assert.equal((markup.match(/<optgroup/g) ?? []).length, 15);
  assert.ok(markup.includes('value="230"'));
  assert.ok(markup.includes('value="441890"'));
  const browse = renderToStaticMarkup(React.createElement(CategoryReference));
  assert.ok(browse.includes('href="https://www.bridgeapi.io/"'));
  assert.ok(browse.includes("127 subcategories"));
  assert.ok(browse.includes("756587"));
});
test("Reference, budgets and history render the migrated default persona and taxonomy", () => {
  const f = modernizeScenario(read("andre")),
    r = generate(f.configuration, f.reference, f.assumptions);
  const reference = renderToStaticMarkup(
    React.createElement(Reference, {
      file: f,
      onApply: () => {},
      onReference: () => {},
      onTaxSystem: () => {},
    }),
  );
  assert.ok(reference.includes("Transaction categories"));
  assert.ok(reference.includes("Bridge"));
  assert.ok(reference.includes("Supermarkets / Groceries"));
  const budgets = renderToStaticMarkup(
    React.createElement(BudgetSettings, { file: f, onApply: () => {} }),
  );
  assert.ok(budgets.includes("Food &amp; Dining"));
  assert.ok(budgets.includes("budget-category-group"));
  const history = renderToStaticMarkup(
    React.createElement(History, {
      file: f,
      result: r,
      account: "all",
      onAccount: () => {},
      current: true,
      onExport: () => {},
    }),
  );
  assert.ok(history.includes("Main categories"));
  assert.ok(history.includes("Subcategories"));
  assert.ok(!history.includes("Missing English message"));
});
