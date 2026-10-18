import { spendingCategories } from "../src/domain/categories";
import { stripLegacySettings } from "../src/config/profile";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  ConfigurationFile,
  CountryMerchantReference,
} from "../src/domain/types";
import { canonicalJson, referenceHash } from "../src/config/canonical";
import {
  applyCountryConversion,
  exportConfiguration,
  exportHistory,
  parseConfiguration,
  previewCountryConversion,
} from "../src/config";
import { generate } from "../src/engine";
import {
  merchantRates,
  monthlyEnvelopes,
  seasonalFactors,
} from "../src/engine/consumption";

const read = <T>(path: string): T =>
  JSON.parse(
    readFileSync(new URL(`../specifications/${path}`, import.meta.url), "utf8"),
  ) as T;
const scenario = (name = "nicolas") =>
  read<ConfigurationFile>(`configurations/${name}.personia.json`);

// These are independent data oracles supplied with the specification, not snapshots
// rewritten from the implementation under test.
for (const model of ["nicolas", "lea", "sarah", "michel"]) {
  test(`${model}: embedded reference SHA-256 matches an independent implementation`, () => {
    const file = scenario(model);
    const canonical = canonicalJson(file.reference);
    assert.equal(
      referenceHash(file.reference),
      createHash("sha256").update(canonical, "utf8").digest("hex"),
    );
    assert.equal(referenceHash(file.reference), file.referenceHash);
  });

  test(`${model}: merchant costs remove geography while category spending remains balanced`, () => {
    const file = scenario(model);
    const derived = read<{
      merchants: {
        id: number;
        meanForProfileEUR: number;
        monthlyFrequency: number;
        selectionWeight: number;
      }[];
    }>(`derived/${model}-reference.json`);
    const rows = merchantRates(
      file.configuration,
      file.reference,
      file.assumptions,
    );
    const actual = new Map(rows.map((row) => [row.merchant.id, row]));
    const regionFactor =
      file.reference.regions.find((r) => r.id === file.configuration.region)
        ?.factor ?? 1;
    for (const expected of derived.merchants) {
      const row = actual.get(expected.id)!;
      assert.ok(row);
      if (expected.monthlyFrequency > 0) assert.equal(row.eligible, true);
      assert.ok(
        Math.abs(row.mean - expected.meanForProfileEUR / regionFactor) < 0.02,
        `${model}/${expected.id}: basket`,
      );
      assert.equal(
        row.weight,
        expected.selectionWeight,
        `${model}/${expected.id}: weight`,
      );
    }
    const budgets = monthlyEnvelopes(
      file.configuration,
      file.reference,
      file.assumptions,
    );
    for (const category of new Set(
      rows.filter((r) => r.eligible).map((r) => r.merchant.category),
    )) {
      const spending = rows
        .filter((r) => r.eligible && r.merchant.category === category)
        .reduce((sum, r) => sum + r.mean * r.frequency, 0);
      assert.ok(Math.abs(spending - budgets[category]) < 0.02, category);
    }
  });
}

interface RecordedTransaction {
  id: number;
  accountId: number;
  amount: number;
  date: string;
  parsedData: { balanceAfter: number; transferId?: string };
}
interface RecordedStatement {
  data: RecordedTransaction[];
  included: {
    accounts: { id: number; openingBalance: number; balance: number }[];
  };
}
for (const [fixture, count] of [
  ["nicolas-history", 507],
  ["credit-savings-fixture-history", 26],
] as const) {
  test(`recorded ${fixture}: every posted balance and transfer reconciles`, () => {
    const history = read<RecordedStatement>(`examples/${fixture}.json`);
    assert.equal(history.data.length, count);
    const balances = new Map(
      history.included.accounts.map((account) => [
        account.id,
        Math.round(account.openingBalance * 100),
      ]),
    );
    const pairs = new Map<string, number[]>();
    for (const operation of [...history.data].sort((a, b) => a.id - b.id)) {
      assert.ok(balances.has(operation.accountId));
      const balance =
        balances.get(operation.accountId)! + Math.round(operation.amount * 100);
      balances.set(operation.accountId, balance);
      assert.equal(
        balance,
        Math.round(operation.parsedData.balanceAfter * 100),
        `posting ${operation.id}`,
      );
      if (operation.parsedData.transferId) {
        const amounts = pairs.get(operation.parsedData.transferId) ?? [];
        amounts.push(Math.round(operation.amount * 100));
        pairs.set(operation.parsedData.transferId, amounts);
      }
    }
    for (const account of history.included.accounts)
      assert.equal(balances.get(account.id), Math.round(account.balance * 100));
    for (const amounts of pairs.values()) {
      assert.equal(amounts.length, 2);
      assert.equal(amounts[0] + amounts[1], 0);
    }
  });
}

test("generation preserves the complete supplied configuration, reference and assumptions", () => {
  const file = scenario();
  const before = structuredClone(file);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.freeze(value);
      Object.values(value).forEach(freeze);
    }
  };
  freeze(file);
  const result = generate(file.configuration, file.reference, file.assumptions);
  assert.ok(result.transactions.length > 0);
  assert.deepEqual(file, before);
  assert.equal(result.referenceHash, file.referenceHash);
});

test("display-only customer, account, income and charge labels preserve financial identity", () => {
  const file = scenario();
  const first = generate(file.configuration, file.reference, file.assumptions);
  const renamed = structuredClone(file.configuration);
  renamed.name = "A different display name";
  renamed.accounts.forEach((account) => {
    account.name += " renamed";
    account.bank = "Scenario bank";
  });
  renamed.incomes.forEach((income) => {
    income.label += " renamed";
  });
  renamed.charges.forEach((charge) => {
    charge.name += " renamed";
  });
  const second = generate(renamed, file.reference, file.assumptions);
  assert.equal(second.fingerprint, first.fingerprint);
  const financialRows = (result: ReturnType<typeof generate>) =>
    result.transactions.map(({ label: _label, ...operation }) => operation);
  assert.deepEqual(financialRows(second), financialRows(first));
  assert.deepEqual(second.dailyBalances, first.dailyBalances);
});

test("display-only calibration descriptions do not change a financial fingerprint", () => {
  const file = scenario();
  const first = generate(file.configuration, file.reference, file.assumptions);
  file.assumptions.consumption!.profiles.forEach((profile) => {
    profile.name = "Translated profile";
    profile.description = "An English explanation of unchanged assumptions.";
  });
  file.assumptions.consumption!.categoryBases.forEach((category) => {
    category.name = "Translated category";
  });
  file.assumptions.seasonality!.source.title = "Translated observation title";
  const second = generate(file.configuration, file.reference, file.assumptions);
  assert.deepEqual(second.transactions, first.transactions);
  assert.equal(second.fingerprint, first.fingerprint);
});

test("explicit zero frequency overrides remove every ordinary merchant purchase", () => {
  const file = scenario();
  file.configuration.merchantOverrides = Object.fromEntries(
    file.reference.merchants.map((merchant) => [
      `${file.reference.id}|${file.configuration.style}|${merchant.id}`,
      { frequency: 0 },
    ]),
  );
  const result = generate(file.configuration, file.reference, file.assumptions);
  assert.equal(
    result.transactions.filter(
      (operation) => operation.simulationKind === "daily",
    ).length,
    0,
  );
  assert.ok(
    result.transactions.some(
      (operation) => operation.simulationKind === "income",
    ),
  );
});

test("explicit envelope amounts bypass demographic factors but retain the no-car fuel gate", () => {
  const file = scenario();
  Object.assign(file.configuration, {
    age: 85,
    household: 8,
    children: 4,
    discretionary: 3,
    style: "comfort",
    car: false,
    budgetOverrides: { healthOthers: 37.42, groceries: 123.45, fuel: 99 },
  });
  const values = monthlyEnvelopes(
    file.configuration,
    file.reference,
    file.assumptions,
  );
  assert.equal(values.healthOthers, 37.42);
  assert.equal(values.groceries, 123.45);
  assert.equal(values.fuel, 0);
});

test("an uncalibrated country does not automatically inherit French demographic or seasonal factors", () => {
  const file = scenario();
  const reference = read<CountryMerchantReference>(
    "country-references/gb.example.v1.json",
  );
  const config = {
    ...file.configuration,
    countryCode: "GB",
    currency: "GBP",
    locale: "en-GB",
    timeZone: "Europe/London",
    referenceId: reference.id,
    region: "*",
    age: 85,
    household: 8,
    children: 4,
  };
  const assumptions = {
    bankingCountry: null,
    consumptionCountry: null,
    seasonalityCountry: null,
    sources: [],
  };
  const envelopes = monthlyEnvelopes(config, reference, assumptions);
  assert.equal(envelopes.groceries, config.budgets.groceries);
  assert.equal(envelopes.healthOthers, config.budgets.healthOthers);
  for (let month = 1; month <= 12; month++)
    assert.deepEqual(seasonalFactors(config, "groceries", month, assumptions), {
      volume: 1,
      amount: 1,
      target: 1,
    });
});

test("closed configuration imports reject malicious and unknown nested data without altering the source", () => {
  const original = scenario();
  const text = JSON.stringify(original);
  for (const [name, mutate] of [
    [
      "unknown income field",
      (value: any) => {
        value.configuration.incomes[0].hiddenRule = "amount * 2";
      },
    ],
    [
      "unknown assumption field",
      (value: any) => {
        value.assumptions.consumption.profiles[0].execute = "not allowed";
      },
    ],
    [
      "prototype property",
      (value: any) => {
        Object.defineProperty(value.configuration.budgets, "__proto__", {
          value: { polluted: true },
          enumerable: true,
        });
      },
    ],
    [
      "unsafe account identifier",
      (value: any) => {
        value.configuration.accounts[0].key = "constructor";
      },
    ],
    [
      "fractional minor unit",
      (value: any) => {
        value.configuration.incomes[0].amount = 123.456;
      },
    ],
    [
      "forged reference hash",
      (value: any) => {
        value.referenceHash = "0".repeat(64);
      },
    ],
    [
      "invalid leap day",
      (value: any) => {
        value.configuration.startDate = "2025-02-29";
      },
    ],
    [
      "duplicate account key",
      (value: any) => {
        value.configuration.accounts[1].key =
          value.configuration.accounts[0].key;
      },
    ],
  ] as const) {
    const modified = structuredClone(original);
    mutate(modified);
    assert.throws(
      () => parseConfiguration(JSON.stringify(modified)),
      Error,
      name,
    );
  }
  assert.deepEqual(parseConfiguration(text), {
    ...original,
    configuration: stripLegacySettings(original.configuration),
  });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("configuration imports reject historical statements, legacy formats and oversized data", () => {
  for (const file of [
    "examples/nicolas-history.json",
    "examples/credit-savings-fixture.personia.json",
  ]) {
    assert.throws(() =>
      parseConfiguration(
        readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
      ),
    );
  }
  assert.throws(
    () => parseConfiguration(" ".repeat(5 * 1024 * 1024 + 1)),
    /5 MiB/,
  );
});

test("country preview preserves foreign budgets, rebases quotes and never converts twice on reload", () => {
  const file = scenario();
  const templates = read<ConfigurationFile["configuration"]["plannedEvents"]>(
    "reference/event-templates.json",
  );
  const trip = structuredClone(
    templates.find((event) => event.type === "travel-abroad")!,
  );
  Object.assign(trip, {
    id: "usa_trip",
    destination: "usa",
    amount: 220,
    exchangeRate: 1.1,
    fxFeePercent: 2,
    startDate: "2026-04-01",
  });
  file.configuration.plannedEvents = [trip];
  const before = structuredClone(file);
  const reference = read<CountryMerchantReference>(
    "country-references/gb.example.v1.json",
  );
  const options = {
    rate: 0.8,
    missingCategories: Object.fromEntries(
      Object.keys(file.configuration.budgets).map((category) => [
        category,
        "inactive" as const,
      ]),
    ),
    budgetAmounts: monthlyEnvelopes(
      file.configuration,
      file.reference,
      file.assumptions,
    ),
  };
  const preview = previewCountryConversion(file, reference, options);
  assert.deepEqual(preview.issues, []);
  assert.deepEqual(file, before);
  assert.equal(preview.configuration.incomes[0].amount, 1600);
  assert.equal(preview.configuration.accounts[0].openingBalance, 64);
  assert.equal(
    preview.configuration.financing.consumerRate,
    file.configuration.financing.consumerRate,
  );
  assert.equal(preview.configuration.plannedEvents[0].amount, 220);
  assert.equal(preview.configuration.plannedEvents[0].exchangeRate, 1.375);
  assert.equal(preview.configuration.plannedEvents[0].fxFeePercent, 2);
  assert.equal(preview.assumptions.bankingCountry, null);
  assert.equal(preview.assumptions.consumptionCountry, null);
  assert.equal(preview.assumptions.seasonalityCountry, null);
  const applied = applyCountryConversion(preview);
  const reloaded = parseConfiguration(
    JSON.stringify(
      exportConfiguration(
        applied.configuration,
        applied.reference,
        applied.assumptions,
        applied.modelId,
      ),
    ),
  );
  assert.deepEqual(reloaded, applied);
  assert.equal(reloaded.configuration.incomes[0].amount, 1600);
  const result = generate(
    applied.configuration,
    applied.reference,
    applied.assumptions,
  );
  assert.deepEqual(
    generate(reloaded.configuration, reloaded.reference, reloaded.assumptions),
    result,
  );
});

test("history export rejects a result generated for earlier financial inputs", () => {
  const file = scenario();
  const result = generate(file.configuration, file.reference, file.assumptions);
  const edited = structuredClone(file);
  edited.configuration.incomes[0].amount += 100;
  assert.throws(
    () => exportHistory(result, edited),
    /stale|recalculate|match/i,
  );
});

test("single-account statement retains account identification and reconciles its scope", () => {
  const file = scenario();
  const result = generate(file.configuration, file.reference, file.assumptions);
  const account = result.accounts[0];
  const statement = exportHistory(result, file, account.key);
  assert.equal(statement.included.accounts.length, 1);
  assert.ok(
    statement.data.every((operation) => operation.accountId === account.id),
  );
  const net = statement.data.reduce(
    (sum, operation) => sum + Math.round(operation.amount * 100),
    0,
  );
  assert.equal(
    Math.round(account.openingBalance * 100) + net,
    Math.round(account.closingBalance * 100),
  );
  assert.deepEqual(statement.included.accounts[0].holders, [
    { id: file.configuration.id, name: file.configuration.name },
  ]);
  assert.equal(
    statement.included.accounts[0].type,
    file.configuration.accounts[0].type,
  );
  assert.ok(!("configuration" in statement.meta));
  assert.ok(!("reference" in statement.meta));
});
