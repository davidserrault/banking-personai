import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  canonicalJson,
  ConfigurationError,
  exportConfiguration,
  parseConfiguration,
  parseMerchantReference,
  sha256,
  validateScenario,
  previewCountryConversion,
  applyCountryConversion,
  exportHistory,
} from "../src/config";
import { generate } from "../src/engine";
import { newCreditFacility } from "../src/config/credit-facilities";
const text = readFileSync(
  new URL(
    "../specifications/configurations/nicolas.personia.json",
    import.meta.url,
  ),
  "utf8",
);
const gbText = readFileSync(
  new URL(
    "../specifications/country-references/gb.example.v1.json",
    import.meta.url,
  ),
  "utf8",
);
const load = () => parseConfiguration(text);

test("credit facilities round-trip and convert their borrowed amount once", () => {
  const scenario = load();
  scenario.configuration.creditFacilities = [
    newCreditFacility("personal", "loan", "2024-01-31"),
  ];
  assert.deepEqual(
    parseConfiguration(JSON.stringify(scenario)).configuration.creditFacilities,
    scenario.configuration.creditFacilities,
  );
  const converted = applyCountryConversion(
    previewCountryConversion(scenario, parseMerchantReference(gbText, "GB"), {
      rate: 0.85,
      missingCategories: Object.fromEntries(
        Object.keys(scenario.configuration.budgets).map((k) => [
          k,
          "inactive" as const,
        ]),
      ),
    }),
  );
  assert.equal(converted.configuration.creditFacilities![0].amount, 8500);
  assert.equal(converted.configuration.creditFacilities![0].annualRate, 6);
  assert.equal(converted.configuration.creditFacilities![0].months, 48);
  assert.equal(scenario.configuration.creditFacilities[0].amount, 10000);
});

test("invalid credit dates, terms, duplicate identifiers and monetary precision are rejected", () => {
  for (const patch of [
    { startDate: "2025-02-30" },
    { months: 0 },
    { months: 481 },
    { annualRate: 51 },
    { amount: 1.001 },
    { replaceHousingCharge: true },
  ]) {
    const scenario = load();
    scenario.configuration.creditFacilities = [
      { ...newCreditFacility("personal", "loan", "2025-01-01"), ...patch },
    ];
    assert.throws(
      () => parseConfiguration(JSON.stringify(scenario)),
      ConfigurationError,
    );
  }
  const scenario = load();
  const loan = newCreditFacility("personal", "duplicate", "2025-01-01");
  scenario.configuration.creditFacilities = [loan, { ...loan }];
  assert.throws(
    () => parseConfiguration(JSON.stringify(scenario)),
    /Duplicate identifier/,
  );
});

test("portable SHA-256 agrees with Node crypto including UTF-8 and block boundaries", () => {
  for (const input of [
    "",
    "abc",
    "Caisse d’Épargne 🏦",
    "a".repeat(55),
    "b".repeat(64),
    "c".repeat(100000),
  ])
    assert.equal(
      sha256(input),
      createHash("sha256").update(input).digest("hex"),
    );
  assert.equal(
    canonicalJson({ z: 2, a: { d: [3, 1], b: 1 } }),
    '{"a":{"b":1,"d":[3,1]},"z":2}',
  );
});
test("all delivered version-2 configurations round-trip their complete financial context", () => {
  for (const model of ["andre", "nicolas", "lea", "michel", "sarah"]) {
    const original = parseConfiguration(
      readFileSync(
        new URL(
          `../specifications/configurations/${model}.personia.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const exported = exportConfiguration(
      original.configuration,
      original.reference,
      original.assumptions,
      original.modelId,
    );
    assert.deepEqual(parseConfiguration(JSON.stringify(exported)), original);
  }
});
test("strict importer rejects non-configuration data, wrong versions and the byte limit", () => {
  assert.throws(() => parseConfiguration("{"), ConfigurationError);
  assert.throws(
    () => parseConfiguration('{"data":[],"meta":{},"included":[]}'),
    ConfigurationError,
  );
  assert.throws(
    () => parseConfiguration(text.replace('"version": 2', '"version": 1')),
    ConfigurationError,
  );
  assert.throws(
    () => parseConfiguration(" ".repeat(5 * 1024 * 1024 + 1)),
    /5 MiB/,
  );
});
test("local merchant importer enforces country, unique ids, precision and region cross-references", () => {
  assert.throws(() => parseMerchantReference(gbText, "FR"), /belongs to GB/);
  const ref = JSON.parse(gbText);
  ref.merchants.push(ref.merchants[0]);
  assert.throws(
    () => parseMerchantReference(JSON.stringify(ref), "GB"),
    /Duplicate identifier/,
  );
  ref.merchants.pop();
  ref.merchants[0].mean = 2.001;
  assert.throws(
    () => parseMerchantReference(JSON.stringify(ref), "GB"),
    /decimal places/,
  );
  ref.merchants[0].mean = 2;
  ref.merchants[0].regions = ["missing"];
  assert.throws(
    () => parseMerchantReference(JSON.stringify(ref), "GB"),
    /Unknown region/,
  );
});
test("semantic validation enforces account, income, money and registry constraints", () => {
  const scenario = load();
  const config = scenario.configuration;
  config.accounts[1].key = config.accounts[0].key;
  config.accounts[1].openingBalance = -1;
  config.incomes[0].main = false;
  config.incomes[0].amount = 1.001;
  config.startDate = "2025-02-30";
  config.charges[0].categoryId = 12345;
  const issues = validateScenario(
    config,
    scenario.reference,
    scenario.assumptions,
  );
  for (const path of [
    "accounts[1]",
    "accounts[1].openingBalance",
    "incomes",
    "incomes[0].amount",
    "startDate",
    "charges[0].categoryId",
  ])
    assert.ok(
      issues.some((issue) => issue.path === `configuration.${path}`),
      path,
    );
});
test("schema validates finite values before numeric operations and does not coerce empty text", () => {
  const scenario = load();
  scenario.configuration.incomes[0].amount = NaN;
  assert.match(
    validateScenario(scenario.configuration, scenario.reference)[0].message,
    /finite/,
  );
  const unknown = JSON.parse(text);
  unknown.configuration.buffer = "";
  assert.throws(
    () => parseConfiguration(JSON.stringify(unknown)),
    /finite number/,
  );
});
test("country preview is immutable and requires decisions for missing merchant categories", () => {
  const scenario = load(),
    unchanged = structuredClone(scenario),
    reference = parseMerchantReference(gbText, "GB");
  const preview = previewCountryConversion(scenario, reference, { rate: 0.85 });
  assert.ok(preview.issues.some((issue) => /No eligible/.test(issue.message)));
  assert.throws(() => applyCountryConversion(preview), ConfigurationError);
  assert.deepEqual(scenario, unchanged);
  const decisions = Object.fromEntries(
    Object.keys(scenario.configuration.budgets).map((category) => [
      category,
      "inactive" as const,
    ]),
  );
  const resolved = previewCountryConversion(scenario, reference, {
    rate: 0.85,
    missingCategories: decisions,
  });
  assert.deepEqual(resolved.issues, []);
  const converted = applyCountryConversion(resolved);
  assert.equal(converted.configuration.incomes[0].amount, 1700);
  assert.equal(converted.configuration.accounts[0].openingBalance, 68);
  assert.equal(converted.assumptions.bankingCountry, null);
  assert.equal(converted.assumptions.consumption, undefined);
  assert.equal(converted.configuration.seasonality.enabled, false);
  assert.ok(resolved.inactiveCategories.length > 0);
});
test("account statement exports only its postings and identification without scenario settings", () => {
  const scenario = load(),
    result = generate(
      scenario.configuration,
      scenario.reference,
      scenario.assumptions,
    );
  const account = scenario.configuration.accounts[0];
  const statement = exportHistory(result, scenario, account.key);
  assert.ok(
    statement.data.every(
      (t) => t.accountId === statement.included.accounts[0].id,
    ),
  );
  assert.equal(statement.meta.count, statement.data.length);
  assert.equal(statement.included.accounts.length, 1);
  assert.equal(statement.format, "personia.account-history");
  assert.deepEqual(statement.meta.persona, {
    id: scenario.configuration.id,
    name: scenario.configuration.name,
  });
  assert.ok(!("configuration" in statement.meta));
  assert.ok(!("reference" in statement.meta));
  const totalMinor = statement.data.reduce(
    (sum, t) => sum + Math.round(t.amount * 100),
    0,
  );
  assert.equal(
    Math.round(statement.included.accounts[0].closingBalance * 100),
    Math.round(account.openingBalance * 100) + totalMinor,
  );
});
