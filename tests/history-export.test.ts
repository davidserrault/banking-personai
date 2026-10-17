import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modernizeScenario } from "../src/config/profile";
import type { ConfigurationFile } from "../src/domain/types";
import {
  exportConfiguration,
  exportHistory,
  parseConfiguration,
} from "../src/config/files";
import { generate } from "../src/engine";
import { toMinor } from "../src/engine/money";
import { download } from "../src/ui/format";

const load = (name = "nicolas") =>
  modernizeScenario(
    JSON.parse(
      readFileSync(
        new URL(
          `../specifications/configurations/${name}.personia.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as ConfigurationFile,
  );

for (const name of ["andre", "nicolas", "lea", "sarah", "michel"]) {
  test(`${name}: all-account and single-account JSON identify accounts and reconcile every operation without configuration data`, () => {
    const file = load(name);
    const c = file.configuration;
    c.startDate = "2025-01-01";
    c.years = 1;
    c.plannedEvents = [];
    const before = structuredClone(file);
    const result = generate(c, file.reference, file.assumptions);
    const configuration = exportConfiguration(
      c,
      file.reference,
      file.assumptions,
      file.modelId,
    );
    assert.deepEqual(
      parseConfiguration(JSON.stringify(configuration)),
      configuration,
    );
    assert.ok(!("data" in configuration));
    for (const scope of [undefined, ...c.accounts.map((a) => a.key)]) {
      const statement = exportHistory(result, file, scope);
      const saved = JSON.parse(JSON.stringify(statement, null, 2));
      assert.deepEqual(saved, statement);
      assert.equal(saved.format, "personia.account-history");
      assert.equal(saved.version, 1);
      assert.equal(saved.meta.count, saved.data.length);
      assert.equal(saved.meta.currency, c.currency);
      assert.equal(saved.meta.transactionOrder, "reverse-chronological");
      for (const key of [
        "configuration",
        "reference",
        "assumptions",
        "provenance",
      ])
        assert.ok(!(key in saved.meta));
      for (const key of ["events", "loans", "modeHistory"])
        assert.ok(!(key in saved.included));
      assert.throws(() => parseConfiguration(JSON.stringify(statement)));
      assert.equal(
        statement.included.accounts.length,
        scope ? 1 : c.accounts.length,
      );
      let net = 0;
      for (const account of statement.included.accounts) {
        const configured = c.accounts.find((a) => a.key === account.key)!;
        assert.equal(account.type, configured.type);
        assert.equal(account.name, configured.name);
        assert.equal(account.bank, configured.bank);
        assert.equal(account.currency, c.currency);
        assert.deepEqual(account.holders, [{ id: c.id, name: c.name }]);
        let balance = account.openingBalanceMinor;
        for (const operation of [...statement.data]
          .reverse()
          .filter((t) => t.accountId === account.id)) {
          assert.equal(operation.balanceBeforeMinor, balance);
          assert.equal(
            toMinor(operation.balanceBefore, c.currencyDigits),
            balance,
          );
          balance += operation.amountMinor;
          net += operation.amountMinor;
          assert.equal(operation.balanceAfterMinor, balance);
          assert.equal(
            toMinor(operation.balanceAfter, c.currencyDigits),
            balance,
          );
          assert.equal(
            operation.parsedData.balanceAfter,
            operation.balanceAfter,
          );
          assert.ok(operation.beneficiary.name);
          assert.ok(operation.counterparty.name);
          if (operation.amountMinor > 0)
            assert.equal(operation.beneficiary.id, c.id);
        }
        assert.equal(balance, account.closingBalanceMinor);
        assert.equal(
          toMinor(account.closingBalance, c.currencyDigits),
          balance,
        );
      }
      assert.equal(statement.meta.totalAmountMinor, net);
      assert.equal(
        toMinor(statement.meta.totals.netChange, c.currencyDigits),
        net,
      );
      assert.equal(
        toMinor(statement.meta.totals.closingBalance, c.currencyDigits),
        toMinor(statement.meta.totals.openingBalance, c.currencyDigits) + net,
      );
      assert.equal(
        toMinor(statement.meta.totals.credits, c.currencyDigits) -
          toMinor(statement.meta.totals.debits, c.currencyDigits),
        net,
      );
      statement.included.merchants.forEach((merchant) =>
        assert.deepEqual(Object.keys(merchant).sort(), [
          "category",
          "id",
          "name",
        ]),
      );
    }
    assert.deepEqual(file, before);
  });
}

test("scoped statements retain the recipient of an internal transfer without exporting another account's operations", () => {
  const file = load();
  const c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.plannedEvents = [];
  c.accounts[0].openingBalance = 10000;
  const from = c.accounts[0].key;
  const to = c.accounts[1].key;
  c.accountTransfers = [
    {
      id: "export-transfer",
      label: "Transfer",
      enabled: true,
      fromAccount: from,
      toAccount: to,
      amount: 100,
      startDate: c.startDate,
      timing: "scheduled",
      recurrence: "once",
      trigger: {
        kind: "balance-below",
        account: from,
        threshold: 0,
        cooldownDays: 1,
      },
    },
  ];
  const result = generate(c, file.reference, file.assumptions);
  const source = exportHistory(result, file, from);
  const destination = result.accounts.find((a) => a.key === to)!;
  const transfer = source.data.find(
    (t) => t.parsedData.transferRuleId === "export-transfer",
  )!;
  assert.equal(transfer.amount, -100);
  assert.equal(transfer.beneficiary.name, c.name);
  assert.equal(transfer.beneficiary.accountId, destination.id);
  assert.equal(transfer.counterpartyAccountIdentifier, String(destination.id));
  assert.equal(source.included.accounts.length, 1);
  assert.ok(source.data.every((t) => t.accountKey === from));
  const target = exportHistory(result, file, to);
  const receipt = target.data.find(
    (t) => t.parsedData.transferRuleId === "export-transfer",
  )!;
  assert.equal(receipt.amount, 100);
  assert.equal(receipt.beneficiary.id, c.id);
  assert.equal(receipt.counterparty.accountKey, from);
});

test("empty accounts export explicit initial and closing balances with zero scoped totals", () => {
  const file = load();
  file.configuration.accounts.push({
    key: "empty",
    name: "Unused savings",
    bank: "Synthetic bank",
    type: "savings",
    openingBalance: 12.34,
    annualRate: 0,
    depositRank: 0,
    withdrawalRank: 0,
  });
  const result = generate(file.configuration, file.reference, file.assumptions);
  const statement = exportHistory(result, file, "empty");
  assert.equal(statement.data.length, 0);
  assert.equal(statement.meta.totalAmountMinor, 0);
  assert.deepEqual(statement.meta.totals, {
    openingBalance: 12.34,
    closingBalance: 12.34,
    credits: 0,
    debits: 0,
    netChange: 0,
  });
  assert.equal(statement.included.accounts[0].openingBalanceMinor, 1234);
});

test("configuration and history downloads have timestamped names and valid formatted UTF-8 JSON", async (t) => {
  const file = load();
  const result = generate(file.configuration, file.reference, file.assumptions);
  const exported = [
    exportConfiguration(file.configuration, file.reference, file.assumptions),
    exportHistory(result, file),
  ];
  const filenames = [
    "Nicolas-configuration.personia.json",
    "Nicolas-all-account-history.json",
  ];
  const blobs: Blob[] = [];
  const clicked: string[] = [];
  const revoked: string[] = [];
  let attached = false;
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        href: "",
        download: "",
        hidden: false,
        click() {
          assert.ok(attached);
          clicked.push(this.download);
        },
        remove() {
          attached = false;
        },
      }),
      body: {
        appendChild() {
          attached = true;
        },
      },
    },
  });
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  t.mock.method(URL, "createObjectURL", (blob: Blob) => {
    blobs.push(blob);
    return `blob:export-${blobs.length}`;
  });
  t.mock.method(URL, "revokeObjectURL", (url: string) => revoked.push(url));
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    callback();
    return 0;
  });
  exported.forEach((value, i) => download(value, filenames[i]));
  assert.equal(clicked.length, 2);
  assert.match(
    clicked[0],
    /^Nicolas-configuration-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.personia\.json$/,
  );
  assert.match(
    clicked[1],
    /^Nicolas-all-account-history-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
  );
  assert.notEqual(clicked[0], clicked[1]);
  assert.equal(attached, false);
  assert.equal(revoked.length, 2);
  for (let i = 0; i < blobs.length; i++) {
    assert.equal(blobs[i].type, "application/json;charset=utf-8");
    const text = await blobs[i].text();
    assert.match(text, /\n  "format":/);
    assert.ok(text.endsWith("\n"));
    assert.deepEqual(JSON.parse(text), exported[i]);
  }
});
