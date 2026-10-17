import type { SimulationResult } from "../engine/types";
import { fromMinor, toMinor } from "../engine/money";

export const combinedBalance = (values: number[], digits = 2) =>
  fromMinor(
    values.reduce((sum, value) => sum + toMinor(value, digits), 0),
    digits,
  );

export const isAllAccounts = (view: string) =>
  view === "all" || view === "combined";

const accountStyles: Record<string, { color: string; label: string }> = {
  checking: { color: "#72B7FF", label: "Current account" },
  savings: { color: "#60D7BB", label: "Savings" },
  investment: { color: "#C6A1FF", label: "Investment" },
  "deferred-card": { color: "#F5C36A", label: "Deferred debit card" },
  "credit-card": { color: "#FFB58A", label: "Credit card" },
};
const dashes = [undefined, "6 3", "2 3", "8 3 2 3"];

/** Independent account lines share one scale; balances are never stacked. */
export function balanceChartData(
  result: Pick<SimulationResult, "accounts" | "dailyBalances"> &
    Partial<Pick<SimulationResult, "currencyDigits">>,
  view: string,
  maxPoints: number,
) {
  const typeCounts: Record<string, number> = {};
  const accountSeries = result.accounts.map((account, i) => {
    const style = accountStyles[account.type] ?? accountStyles.checking;
    const index = typeCounts[account.type] ?? 0;
    typeCounts[account.type] = index + 1;
    return {
      // Avoid interpreting punctuation in imported account keys as a data path.
      key: `account_${i}`,
      accountKey: account.key,
      name: account.name,
      typeLabel: style.label,
      color: style.color,
      dash: dashes[index % dashes.length],
    };
  });
  const series =
    view === "combined"
      ? [
          {
            key: "balance",
            accountKey: "combined",
            name: "Combined balance",
            typeLabel: "All accounts",
            color: "#FFFFFF",
            dash: undefined,
          },
        ]
      : accountSeries.filter((s) => view === "all" || s.accountKey === view);
  let minimum = 0,
    maximum = 1;
  const allData = result.dailyBalances.map((day) => {
    const row: { date: string; [key: string]: string | number } = {
      date: day.date,
      availableAssets: day.assets - day.checking,
    };
    for (const s of series) {
      const value =
        view === "combined"
          ? combinedBalance(Object.values(day.accounts), result.currencyDigits)
          : (day.accounts[s.accountKey] ?? 0);
      row[s.key] = value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    return row;
  });
  const step = Math.max(1, Math.ceil(allData.length / maxPoints));
  const data = allData.filter(
    (_, i) => i % step === 0 || i === allData.length - 1,
  );
  // SVG gradients use each rendered curve's bounds, not the shared axis range.
  const coloredSeries = series.map((s) => {
    const values = data.map((row) => Number(row[s.key]));
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    return {
      ...s,
      minimum: low,
      maximum: high,
      zeroOffset: high > 0 ? high / (high - low) : 0,
    };
  });
  return { series: coloredSeries, data, minimum, maximum };
}
