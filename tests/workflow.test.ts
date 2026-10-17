import test from "node:test";
import assert from "node:assert/strict";
import source from "../specifications/configurations/nicolas.personia.json";
import { mergeReference } from "../src/config/reference-draft";
import { generate } from "../src/engine";
import { toMinor } from "../src/engine/money";
import type { ConfigurationFile } from "../src/domain/types";

test("reference draft merges into the latest configuration without reverting subsequent financial edits", () => {
  const file = structuredClone(source) as ConfigurationFile;
  const draft = {
    budgetOverrides: { groceries: 600 },
    merchantOverrides: { "fr.merchants.v1|family|800000": { frequency: 0 } },
  };
  file.configuration.incomes[0].amount = 2500;
  file.configuration.name = "Edited later";
  const applied = mergeReference(file, draft);
  assert.equal(applied.configuration.name, "Edited later");
  assert.equal(applied.configuration.incomes[0].amount, 2500);
  assert.equal(applied.configuration.budgetOverrides?.groceries, 600);
  assert.equal(file.configuration.budgetOverrides, undefined);
});

test("monthly aggregates reconcile to whole-history totals without retired fee fields", () => {
  const file = structuredClone(source) as ConfigurationFile;
  const result = generate(file.configuration, file.reference, file.assumptions);
  assert.equal(
    result.monthlyTotals.reduce((s, m) => s + toMinor(m.income), 0),
    toMinor(result.summary.income),
  );
  assert.equal(
    result.monthlyTotals.reduce((s, m) => s + toMinor(m.expenses), 0),
    toMinor(result.summary.expenses),
  );
  assert.equal(
    result.monthlyTotals.reduce((s, m) => s + m.transactionCount, 0),
    result.transactions.length,
  );
  assert.equal("accruedOverdraftInterest" in result, false);
  assert.equal("pendingFees" in result, false);
  assert.equal("fees" in result.summary, false);
});

test("the maximum 20-year horizon settles all balances and remains reproducible", () => {
  const file = structuredClone(source) as ConfigurationFile;
  file.configuration.years = 20;
  const result = generate(file.configuration, file.reference, file.assumptions);
  assert.equal(result.endDate, "2045-09-14");
  assert.ok(result.dailyBalances.length >= 7300);
  for (const account of result.accounts)
    assert.equal(
      toMinor(account.openingBalance) +
        result.transactions
          .filter((t) => t.accountKey === account.key)
          .reduce((s, t) => s + t.amountMinor, 0),
      toMinor(account.closingBalance),
    );
  assert.deepEqual(
    result,
    generate(file.configuration, file.reference, file.assumptions),
  );
});
