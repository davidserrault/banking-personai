import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Store } from "lucide-react";
import type { ConfigurationFile } from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import { generate } from "../src/engine";
import { Reference, type ReferenceTab } from "../src/ui/Reference";
import { History, type HistoryTab } from "../src/ui/History";
import { SubTabs } from "../src/ui/SubTabs";
import { combinedBalance } from "../src/ui/balance-data";
import { money, number } from "../src/ui/format";

const file = modernizeScenario(
  JSON.parse(
    readFileSync(
      new URL(
        "../specifications/configurations/andre.personia.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ConfigurationFile,
);
const result = generate(file.configuration, file.reference, file.assumptions);
const referenceMarkup = (tab: ReferenceTab) =>
  renderToStaticMarkup(
    React.createElement(Reference, {
      file,
      tab,
      onApply() {},
      onReference() {},
      onTaxSystem() {},
    }),
  );
const historyMarkup = (
  tab: HistoryTab,
  account = "all",
  current = true,
  value = result,
) =>
  renderToStaticMarkup(
    React.createElement(History, {
      file,
      result: value,
      tab,
      account,
      current,
      onAccount() {},
      onExport() {},
    }),
  );

function assertPanels(
  markup: string,
  prefix: string,
  tabs: readonly string[],
  active: string,
) {
  assert.equal((markup.match(/role="tablist"/g) ?? []).length, 1);
  assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, tabs.length);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
  for (const tab of tabs) {
    const button = markup.match(
      new RegExp(`<button[^>]*id="${prefix}-tab-${tab}"[^>]*>`),
    )?.[0];
    assert.ok(button);
    assert.ok(button.includes(`aria-selected="${tab === active}"`));
    assert.ok(button.includes(`aria-controls="${prefix}-panel-${tab}"`));
    assert.ok(button.includes(`tabindex="${tab === active ? 0 : -1}"`));
    const panel = markup.match(
      new RegExp(`<div[^>]*id="${prefix}-panel-${tab}"[^>]*>`),
    )?.[0];
    assert.ok(panel);
    assert.equal(panel.includes('hidden=""'), tab !== active);
    assert.ok(panel.includes(`aria-labelledby="${prefix}-tab-${tab}"`));
  }
}

test("Reference has three exclusive sections and keeps editable tax and merchant drafts mounted", () => {
  for (const tab of ["merchants", "taxes", "categories"] as const) {
    const markup = referenceMarkup(tab);
    assertPanels(
      markup,
      "reference",
      ["merchants", "taxes", "categories"],
      tab,
    );
    // Inactive reference editors stay mounted so changing tabs does not discard an unapplied tax edit.
    assert.ok(markup.includes("Income tax reference"));
    assert.ok(markup.includes('class="merchant-table"'));
    assert.ok(markup.includes('href="https://www.bridgeapi.io/"'));
    assert.ok(markup.includes("127 subcategories"));
    assert.ok(!markup.includes("Edit data context in Profile"));
    assert.ok(!markup.includes("Edit budget in Behaviour"));
    assert.ok(!markup.includes("Monthly budget:"));
    assert.equal((markup.match(/Download reference/g) ?? []).length, 1);
    const actions = markup.match(
      /<div class="reference-file-actions"[^>]*>/,
    )?.[0];
    assert.equal(actions?.includes('hidden=""'), tab === "categories");
  }
});

test("Accounts puts charts, transactions, and event results in their own panels", () => {
  for (const tab of ["summary", "transactions", "events"] as const) {
    const markup = historyMarkup(tab);
    assertPanels(
      markup,
      "accounts",
      ["summary", "transactions", "events"],
      tab,
    );
    assert.equal(markup.includes('class="balance-chart '), tab === "summary");
    assert.equal(
      markup.includes('class="transactions-table"'),
      tab === "transactions",
    );
    assert.equal(
      markup.includes('class="event-result"'),
      tab === "events" && result.events.length > 0,
    );
    assert.equal(
      markup.includes('class="mode-timeline"'),
      tab === "events" && result.modeHistory.length > 0,
    );
    assert.equal(markup.includes('class="accounts-toolbar"'), tab !== "events");
    assert.ok(!markup.includes('class="account-tabs"'));
    assert.ok(!markup.includes('class="json-preview"'));
    assert.ok(!markup.includes('class="reproducibility"'));
    assert.ok(!markup.includes('class="banking-strip"'));
  }
});

test("Accounts summary and transactions use the selected account, with combined balances including card debt", () => {
  for (const account of [
    "all",
    "combined",
    ...result.accounts.map((a) => a.key),
  ]) {
    const markup = historyMarkup("summary", account);
    const last = result.dailyBalances.at(-1)!;
    const closing = ["all", "combined"].includes(account)
      ? combinedBalance(Object.values(last.accounts), result.currencyDigits)
      : last.accounts[account];
    const ops = result.transactions.filter(
      (x) => ["all", "combined"].includes(account) || x.accountKey === account,
    );
    assert.ok(
      markup.includes(
        `Closing balance</span><strong${closing < 0 ? ' class="negative"' : ' class=""'}>${money(closing, file.configuration)}</strong>`,
      ),
    );
    assert.ok(
      markup.includes(
        `Transactions</span><strong class="">${number(ops.length)}</strong>`,
      ),
    );
    const transactions = historyMarkup("transactions", account);
    assert.ok(transactions.includes(`${number(ops.length)} transactions`));
    assert.ok(!transactions.includes('<option value="combined"'));
    for (const transaction of ops.slice(0, 30)) {
      const label = renderToStaticMarkup(
        React.createElement("strong", {}, transaction.label),
      );
      assert.ok(transactions.includes(label));
    }
  }
});

test("Account downloads stay available once per relevant tab and are disabled for stale histories", () => {
  for (const current of [false, true]) {
    for (const tab of ["summary", "transactions"] as const) {
      const markup = historyMarkup(tab, "all", current);
      assert.equal((markup.match(/Download account history/g) ?? []).length, 1);
      const button = markup.match(/<button class="button primary"[^>]*>/)?.[0];
      assert.equal(button?.includes('disabled=""'), !current);
    }
  }
  assert.ok(!historyMarkup("events").includes("Download account history"));
});

test("Accounts preserves navigation before a result exists and displays an empty Events panel", () => {
  for (const tab of ["summary", "transactions", "events"] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(History, {
        file,
        tab,
        account: "all",
        current: false,
        onAccount() {},
        onExport() {},
      }),
    );
    assertPanels(
      markup,
      "accounts",
      ["summary", "transactions", "events"],
      tab,
    );
    assert.ok(markup.includes("Your ledger is taking shape"));
  }
  const emptyFile = structuredClone(file);
  emptyFile.configuration.spendingModes = [];
  const empty = { ...result, events: [], loans: [], audit: [] };
  const markup = renderToStaticMarkup(
    React.createElement(History, {
      file: emptyFile,
      result: empty,
      tab: "events",
      account: "all",
      current: true,
      onAccount() {},
      onExport() {},
    }),
  );
  assert.ok(markup.includes("No events in this history"));
});

test("Subtabs support pointer selection, arrow-key wrapping, Home and End", () => {
  const items = ["first", "second", "third"].map((id) => ({
    id,
    label: id,
    icon: Store,
  }));
  let selected = "first";
  const component = SubTabs({
    id: "test",
    label: "Test",
    items,
    value: selected,
    onChange: (value) => {
      selected = value;
    },
  });
  const buttons = component.props.children as React.ReactElement<any>[];
  buttons[1].props.onClick();
  assert.equal(selected, "second");
  for (const [index, key, expected] of [
    [0, "ArrowLeft", 2],
    [2, "ArrowRight", 0],
    [1, "Home", 0],
    [1, "End", 2],
    [0, "ArrowRight", 1],
  ] as const) {
    let focused = -1;
    let prevented = false;
    buttons[index].props.onKeyDown({
      key,
      preventDefault() {
        prevented = true;
      },
      currentTarget: {
        parentElement: {
          querySelectorAll() {
            return buttons.map((_, i) => ({
              focus() {
                focused = i;
              },
            }));
          },
        },
      },
    });
    assert.equal(selected, items[expected].id);
    assert.equal(focused, expected);
    assert.ok(prevented);
  }
});
