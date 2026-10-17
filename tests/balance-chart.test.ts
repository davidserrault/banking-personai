import test from "node:test";
import assert from "node:assert/strict";
import {
  balanceChartData,
  combinedBalance,
  isAllAccounts,
} from "../src/ui/balance-data";
import type { SimulationResult } from "../src/engine/types";
const result: Pick<SimulationResult, "accounts" | "dailyBalances"> = {
  accounts: ["checking", "savings", "savings", "investment"].map((type, i) => ({
    key: `account.${i}`,
    id: i,
    name: `Account ${i}`,
    bank: "Bank",
    type,
    openingBalance: 0,
    closingBalance: 0,
    accruedInterest: 0,
  })),
  dailyBalances: Array.from({ length: 10 }, (_, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, "0")}`,
    checking: i - 5,
    assets: i + 595,
    debt: 0,
    netAssets: i + 595,
    accounts: {
      "account.0": i - 5,
      "account.1": 100,
      "account.2": 200,
      "account.3": 300,
    },
  })),
};
test("all accounts use independent balances, type colors and distinguishable same-type lines", () => {
  const chart = balanceChartData(result, "all", 800);
  assert.equal(chart.series.length, 4);
  assert.deepEqual(
    chart.series.map((s) => chart.data[0][s.key]),
    [-5, 100, 200, 300],
  );
  assert.equal(chart.minimum, -5);
  assert.equal(chart.maximum, 300);
  assert.equal(chart.series[1].color, chart.series[2].color);
  assert.notEqual(chart.series[1].dash, chart.series[2].dash);
  assert.equal(new Set(chart.series.map((s) => s.color)).size, 3);
  // A large positive savings balance must not shift the current account's zero.
  assert.equal(chart.series[0].zeroOffset, 4 / 9);
  assert.equal(chart.series[1].zeroOffset, 1);
  for (const maxPoints of [150, 800]) {
    const current = balanceChartData(result, "account.0", maxPoints);
    assert.equal(current.series[0].zeroOffset, chart.series[0].zeroOffset);
  }
});
test("combined and individual views retain totals, scope and the final sampled date", () => {
  assert.equal(combinedBalance([0.1, 0.2, -0.3]), 0);
  assert.equal(combinedBalance([0.001, 0.002, -0.003], 3), 0);
  const combined = balanceChartData(result, "combined", 3);
  assert.equal(combined.data[0].balance, 595);
  assert.equal(combined.data.at(-1)?.date, "2025-01-10");
  assert.equal(combined.data.at(-1)?.balance, 604);
  assert.equal(combined.series.length, 1);
  const single = balanceChartData(result, "account.1", 800);
  assert.equal(single.series.length, 1);
  assert.equal(single.data[0][single.series[0].key], 100);
  assert.equal(isAllAccounts("all"), true);
  assert.equal(isAllAccounts("combined"), true);
  assert.equal(isAllAccounts("account.1"), false);
  const negative = structuredClone(result);
  negative.dailyBalances.forEach((day) => {
    for (const key of Object.keys(day.accounts))
      day.accounts[key] = key === "account.0" ? -10 : 0;
    day.assets = -10;
  });
  for (const view of ["account.0", "combined"]) {
    const chart = balanceChartData(negative, view, 150);
    assert.equal(chart.series[0].maximum, 0);
    assert.equal(chart.series[0].zeroOffset, 0);
  }
});
