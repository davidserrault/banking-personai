import test from "node:test";
import assert from "node:assert/strict";
import source from "../specifications/configurations/nicolas.personia.json";
import type { ConfigurationFile } from "../src/domain/types";
import {
  adjustReference,
  categoryMetrics,
  resetBudget,
  editMerchantCatalog,
  type AdjustmentTarget,
} from "../src/config/reference-adjustments";
import { mergeReference } from "../src/config/reference-draft";
import {
  exportReferenceSettings,
  parseMerchantReference,
  previewCountryConversion,
  applyCountryConversion,
  exportConfiguration,
} from "../src/config";
import { merchantRates } from "../src/engine/consumption";

function fixture() {
  const file = structuredClone(source) as ConfigurationFile;
  file.reference.merchants = [
    {
      id: 900001,
      name: "Shop A",
      category: "groceries",
      mean: 10,
      regions: ["*"],
      scenario: true,
    },
    {
      id: 900002,
      name: "Shop B",
      category: "groceries",
      mean: 20,
      regions: ["*"],
      scenario: true,
    },
  ];
  file.configuration.budgets = Object.fromEntries(
    Object.keys(file.configuration.budgets).map((k) => [k, 0]),
  );
  file.configuration.budgetOverrides = { groceries: 70 };
  file.configuration.merchantOverrides = {
    [file.reference.id + "|family|900001"]: { mean: 10, frequency: 3 },
    [file.reference.id + "|family|900002"]: { mean: 20, frequency: 2 },
  };
  return exportConfiguration(
    file.configuration,
    file.reference,
    file.assumptions,
    file.modelId,
  );
}
const rates = (file: ConfigurationFile) =>
  merchantRates(file.configuration, file.reference, file.assumptions);
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test("adding and removing a merchant keeps other purchases fixed and updates the budget", () => {
  const file = fixture();
  const added = mergeReference(
    file,
    editMerchantCatalog(file, "groceries", 900003, {
      merchant: {
        id: 900003,
        name: "Shop C",
        category: "groceries",
        mean: 15,
        regions: ["*"],
        scenario: true,
      },
      frequency: 2,
    }),
  );
  close(categoryMetrics(added, "groceries").budget, 100);
  assert.deepEqual(rates(added).slice(0, 2), rates(file));
  const removed = mergeReference(
    added,
    editMerchantCatalog(added, "groceries", 900003),
  );
  close(categoryMetrics(removed, "groceries").budget, 70);
  assert.deepEqual(rates(removed), rates(file));
});

for (const target of ["mean", "frequency", "both"] as AdjustmentTarget[])
  test(`budget edit adjusts ${target} and preserves the spending relationship`, () => {
    const file = fixture(),
      before = structuredClone(file);
    const next = mergeReference(
      file,
      adjustReference(
        file,
        { kind: "budget", category: "groceries", value: 280 },
        target,
      ),
    );
    const m = categoryMetrics(next, "groceries");
    close(m.budget, 280);
    close(m.spending, 280);
    rates(next).forEach((r, i) => {
      if (target === "mean") close(r.frequency, rates(file)[i].frequency);
      if (target === "frequency") close(r.mean, rates(file)[i].mean);
      if (target === "both") {
        close(r.mean, rates(file)[i].mean * 2);
        close(r.frequency, rates(file)[i].frequency * 2);
      }
    });
    assert.deepEqual(file, before);
  });
for (const kind of ["mean", "frequency"] as const) {
  const other = kind === "mean" ? "frequency" : "mean";
  for (const target of ["budget", other, "both"] as AdjustmentTarget[])
    test(`${kind} edit with ${target} keeps the other merchant unchanged`, () => {
      const file = fixture();
      const next = mergeReference(
        file,
        adjustReference(
          file,
          { kind, merchantId: 900001, value: kind === "mean" ? 40 : 12 },
          target,
        ),
      );
      const m = categoryMetrics(next, "groceries");
      close(m.spending, m.budget);
      close(m.budget, target === "budget" ? 160 : target === "both" ? 100 : 70);
      assert.deepEqual(rates(next)[1], rates(file)[1]);
      if (target === "budget")
        close(rates(next)[0][other], rates(file)[0][other]);
    });
}
test("zero budgets stop purchases, can restart, and reset removes the linked overrides", () => {
  const file = fixture();
  const stopped = mergeReference(
    file,
    adjustReference(
      file,
      { kind: "budget", category: "groceries", value: 0 },
      "frequency",
    ),
  );
  assert.equal(categoryMetrics(stopped, "groceries").spending, 0);
  const resumed = mergeReference(
    stopped,
    adjustReference(
      stopped,
      { kind: "budget", category: "groceries", value: 80 },
      "both",
    ),
  );
  close(categoryMetrics(resumed, "groceries").spending, 80);
  const reset = mergeReference(resumed, resetBudget(resumed, "groceries"));
  assert.equal(reset.configuration.budgetOverrides?.groceries, undefined);
  assert.deepEqual(reset.configuration.merchantOverrides, {});
  assert.throws(() =>
    adjustReference(
      file,
      { kind: "frequency", merchantId: 900001, value: 0 },
      "mean",
    ),
  );
});
test("unavailable merchants and invalid linked values are rejected before staging", () => {
  const file = fixture();
  assert.throws(() =>
    adjustReference(
      file,
      { kind: "budget", category: "groceries", value: NaN },
      "both",
    ),
  );
  assert.throws(() =>
    adjustReference(
      file,
      { kind: "mean", merchantId: 900001, value: 1.111 },
      "budget",
    ),
  );
  assert.throws(() =>
    adjustReference(
      file,
      { kind: "frequency", merchantId: 900001, value: 1001 },
      "budget",
    ),
  );
  file.reference.merchants[0].travelOnly = true;
  assert.throws(() =>
    adjustReference(
      file,
      { kind: "mean", merchantId: 900001, value: 20 },
      "budget",
    ),
  );
});
test("reference settings round trip through the existing uploader and country preview", () => {
  const file = fixture();
  const edited = mergeReference(
    file,
    adjustReference(
      file,
      { kind: "budget", category: "groceries", value: 280 },
      "both",
    ),
  );
  const reference = parseMerchantReference(
    JSON.stringify(exportReferenceSettings(edited)),
    "FR",
  );
  assert.equal(reference.format, "personia.merchant-reference");
  const preview = previewCountryConversion(file, reference);
  assert.deepEqual(preview.issues, []);
  const loaded = applyCountryConversion(preview);
  assert.deepEqual(rates(loaded), rates(edited));
  assert.deepEqual(
    categoryMetrics(loaded, "groceries"),
    categoryMetrics(edited, "groceries"),
  );
  assert.equal(loaded.configuration.name, file.configuration.name);
  assert.equal(loaded.reference.settings, undefined);
});
test("legacy catalog files remain valid and malformed settings are rejected", () => {
  assert.equal(
    parseMerchantReference(JSON.stringify(source.reference)).id,
    source.reference.id,
  );
  const reference = exportReferenceSettings(fixture());
  reference.settings!.region = "missing-region";
  assert.throws(() => parseMerchantReference(JSON.stringify(reference)));
  reference.settings!.region = "*";
  reference.settings!.merchantOverrides = {
    "wrong|family|900001": { mean: 10 },
  };
  assert.throws(() => parseMerchantReference(JSON.stringify(reference)));
});
test("reference download includes the staged values for the supplied complete persona", () => {
  const file = structuredClone(source) as ConfigurationFile;
  const edited = mergeReference(
    file,
    adjustReference(
      file,
      { kind: "budget", category: "groceries", value: 600 },
      "frequency",
    ),
  );
  const reference = exportReferenceSettings(edited);
  const preview = previewCountryConversion(file, reference);
  assert.deepEqual(preview.issues, []);
  const imported = applyCountryConversion(preview);
  assert.equal(categoryMetrics(imported, "groceries").budget, 600);
  assert.deepEqual(rates(imported), rates(edited));
});
