import test from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import type { ConfigurationFile } from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import {
  defaultTaxSystem,
  taxShares,
  taxEstimate,
  taxDue,
} from "../src/engine/taxes";
import {
  generate,
  merchantRates,
  monthlyEnvelopes,
  financialFingerprint,
} from "../src/engine";
import {
  parseConfiguration,
  exportConfiguration,
  exportReferenceSettings,
  parseMerchantReference,
  validateScenario,
} from "../src/config";
import { adjustReference } from "../src/config/reference-adjustments";
import { mergeReference } from "../src/config/reference-draft";
const load = () =>
  modernizeScenario(structuredClone(bundled) as ConfigurationFile);
function clean() {
  const file = load(),
    c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.accounts = [
    {
      key: "checking",
      name: "Current",
      bank: "Synthetic",
      type: "checking",
      openingBalance: 0,
    },
  ];
  c.incomes = [
    {
      id: "salary",
      label: "Salary",
      amount: 5000,
      frequency: "monthly",
      day: 1,
      month: 1,
      amountVariation: 0,
      frequencyVariation: 0,
      annualGrowth: 0,
      main: true,
      enabled: true,
    },
  ];
  c.charges = [];
  c.events = Object.fromEntries(Object.keys(c.events).map((k) => [k, false]));
  c.budgets = Object.fromEntries(Object.keys(c.budgets).map((k) => [k, 0]));
  c.budgetOverrides = {};
  c.merchantOverrides = {};
  c.autoSavings = false;
  c.autoTopup = false;
  c.financing.consumerEnabled = false;
  c.financing.cardEnabled = false;
  return file;
}
test("household tax shares follow the supplied single and couple rules", () => {
  assert.equal(taxShares(1, 0), 1);
  for (const [children, shares] of [
    [0, 2],
    [1, 2.5],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ])
    assert.equal(taxShares(children + 2, children), shares);
  assert.equal(taxShares(2, 1), 1.5);
});
test("the supplied grid uses marginal bands and scales for unlisted tax shares", () => {
  const { configuration: c } = clean();
  const estimate = taxEstimate(c);
  assert.equal(estimate.shares, 3);
  assert.equal(estimate.annualIncome, 60000);
  assert.equal(estimate.marginalRate, 11);
  assert.equal(estimate.annualTax, 2772);
  c.household = 6;
  c.children = 4;
  assert.equal(taxEstimate(c).annualTax, 220);
  assert.equal(taxEstimate(c).scaledRow, true);
  c.incomes[0].amount = 0;
  assert.equal(taxEstimate(c).annualTax, 0);
});
test("monthly, quarterly and yearly income taxes debit the correct dates and reconcile annual totals", () => {
  for (const frequency of ["monthly", "quarterly", "annual"] as const) {
    const file = clean();
    file.configuration.incomeTax = {
      enabled: true,
      frequency,
      day: 31,
      month: 12,
    };
    const r = generate(file.configuration, file.reference, file.assumptions);
    const taxes = r.transactions.filter((t) => t.simulationKind === "tax");
    assert.equal(
      taxes.length,
      frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1,
    );
    assert.equal(
      taxes.reduce((s, t) => s - t.amountMinor, 0),
      277200,
    );
    assert.equal(r.summary.closingBalance, 60000 - 2772);
    if (frequency === "monthly")
      assert.ok(taxes.some((t) => t.date.startsWith("2025-02-28")));
    if (frequency === "quarterly")
      assert.deepEqual(taxes.map((t) => t.date.slice(5, 7)).sort(), [
        "03",
        "06",
        "09",
        "12",
      ]);
  }
  const p = { enabled: true, frequency: "monthly" as const, day: 1, month: 1 };
  assert.equal(
    Array.from({ length: 12 }, (_, i) =>
      taxDue(p, `2025-${String(i + 1).padStart(2, "0")}-01`, 100.01, 2, true),
    ).reduce((a, b) => a + b, 0),
    10001,
  );
});
test("other taxes are per payment and disabled taxes never post", () => {
  const file = clean(),
    c = file.configuration;
  c.incomeTax!.enabled = false;
  c.otherTaxes = [
    {
      id: "property",
      label: "Property tax",
      amount: 1234.56,
      enabled: true,
      frequency: "annual",
      day: 31,
      month: 4,
    },
    {
      id: "local",
      label: "Local residence tax",
      amount: 100,
      enabled: true,
      frequency: "quarterly",
      day: 15,
      month: 1,
    },
    {
      id: "off",
      label: "Disabled tax",
      amount: 99,
      enabled: false,
      frequency: "monthly",
      day: 1,
      month: 1,
    },
  ];
  const r = generate(c, file.reference, file.assumptions);
  const taxes = r.transactions.filter((t) => t.simulationKind === "tax");
  assert.equal(taxes.length, 5);
  assert.equal(
    taxes.find((t) => t.label === "Property tax")?.date.slice(0, 10),
    "2025-04-30",
  );
  assert.equal(r.summary.closingBalance, 60000 - 1634.56);
});
test("custom tax rows and columns round-trip; malformed grids are rejected", () => {
  const file = clean();
  file.reference.taxSystem = {
    rates: [10],
    rows: [{ shares: 1, limits: [null] }],
  };
  assert.equal(
    taxEstimate(file.configuration, file.reference.taxSystem).annualTax,
    6000,
  );
  const exported = exportConfiguration(
    file.configuration,
    file.reference,
    file.assumptions,
  );
  assert.deepEqual(
    parseConfiguration(JSON.stringify(exported)).reference.taxSystem,
    file.reference.taxSystem,
  );
  assert.deepEqual(
    parseMerchantReference(JSON.stringify(exportReferenceSettings(file)))
      .taxSystem,
    file.reference.taxSystem,
  );
  for (const limits of [
    [100, 50, null],
    [null, 100, null],
    [100, null],
  ]) {
    const invalid = structuredClone(file.reference);
    invalid.taxSystem = { rates: [0, 10, 20], rows: [{ shares: 1, limits }] };
    assert.ok(
      validateScenario(file.configuration, invalid, file.assumptions).length >
        0,
    );
  }
});
test("legacy geographic and family settings cannot influence spending or generated cash flows", () => {
  const f = clean(),
    c = f.configuration;
  const r = generate(c, f.reference, f.assumptions);
  Object.assign(c, {
    countryCode: "GB",
    region: "idf",
    urbanity: "rural",
    family: "single",
  });
  assert.deepEqual(generate(c, f.reference, f.assumptions), r);
  const exported = exportConfiguration(c, f.reference, f.assumptions);
  for (const k of ["countryCode", "region", "urbanity", "family"])
    assert.ok(!(k in exported.configuration));
});
test("location text and display currency leave the financial history and fingerprint unchanged", () => {
  const f = clean(),
    c = f.configuration;
  const before = generate(c, f.reference, f.assumptions);
  c.displayCurrency = "JPY";
  c.locationDescription = "Tokyo";
  assert.deepEqual(generate(c, f.reference, f.assumptions), before);
});
test("living-cost multiplier adjusts purchase amounts including overrides while preserving frequency", () => {
  const f = load();
  f.configuration.seasonality.enabled = false;
  const patch = adjustReference(
    f,
    { kind: "budget", category: "groceries", value: 600 },
    "frequency",
  );
  const configured = mergeReference(f, patch);
  const before = merchantRates(
    configured.configuration,
    configured.reference,
    configured.assumptions,
  );
  configured.configuration.costOfLiving = 2;
  const after = merchantRates(
    configured.configuration,
    configured.reference,
    configured.assumptions,
  );
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(after[i].mean - before[i].mean * 2) <= 0.011);
    if (before[i].eligible)
      assert.equal(after[i].frequency, before[i].frequency);
  }
  assert.equal(
    monthlyEnvelopes(
      configured.configuration,
      configured.reference,
      configured.assumptions,
    ).groceries,
    1200,
  );
  const adjusted = mergeReference(
    configured,
    adjustReference(
      configured,
      { kind: "budget", category: "groceries", value: 1000 },
      "frequency",
    ),
  );
  assert.equal(
    monthlyEnvelopes(
      adjusted.configuration,
      adjusted.reference,
      adjusted.assumptions,
    ).groceries,
    1000,
  );
  const reference = exportReferenceSettings(adjusted);
  const restored = mergeReference(
    { ...adjusted, reference },
    reference.settings!,
  );
  assert.deepEqual(
    merchantRates(restored.configuration, reference, restored.assumptions),
    merchantRates(
      adjusted.configuration,
      adjusted.reference,
      adjusted.assumptions,
    ),
  );
});
