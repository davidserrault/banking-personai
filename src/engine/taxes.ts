import type { PersonaConfig, TaxSystem, TaxPayment } from "../domain/types";
import { monthlyIncome } from "./incomes";
import { daysInMonth, parts } from "./calendar";
import { toMinor, fromMinor } from "./money";

export function defaultTaxSystem(): TaxSystem {
  return {
    rates: [0, 11, 30, 41, 45],
    rows: [1, 1.5, 2, 2.5, 3, 3.5, 4].map((shares) => ({
      shares,
      limits: [
        ...[11600, 29579, 84577, 181917].map((n) => Math.round(n * shares)),
        null,
      ],
    })),
  };
}
export const defaultIncomeTax = (): TaxPayment => ({
  enabled: true,
  frequency: "monthly",
  day: 28,
  month: 12,
});
export function taxShares(household: number, children: number): number {
  const adults = Math.max(1, household - children);
  return (
    Math.min(2, adults) +
    Math.min(children, 2) * 0.5 +
    Math.max(0, children - 2)
  );
}
export function taxEstimate(
  config: PersonaConfig,
  system: TaxSystem = defaultTaxSystem(),
  year = Number(config.startDate.slice(0, 4)),
) {
  const years = Math.max(0, year - Number(config.startDate.slice(0, 4)));
  const annualIncome =
    monthlyIncome(
      config.incomes.map((i) => ({
        ...i,
        amount: i.amount * (1 + i.annualGrowth / 100) ** years,
      })),
    ) * 12;
  const shares = taxShares(config.household, config.children);
  const row =
    system.rows.find((r) => r.shares === shares) ??
    [...system.rows].sort(
      (a, b) => Math.abs(a.shares - shares) - Math.abs(b.shares - shares),
    )[0];
  if (!row || row.limits.length !== system.rates.length)
    throw new Error("Complete the tax grid.");
  const limits = row.limits.map((n) =>
    n === null ? Infinity : (n * shares) / row.shares,
  );
  let lower = 0,
    amount = 0,
    marginalRate = system.rates[0];
  for (let i = 0; i < limits.length; i++) {
    if (annualIncome > lower) {
      amount +=
        (Math.max(0, Math.min(annualIncome, limits[i]) - lower) *
          system.rates[i]) /
        100;
      marginalRate = system.rates[i];
    }
    lower = limits[i];
  }
  return {
    annualIncome,
    shares,
    annualTax: fromMinor(
      toMinor(amount, config.currencyDigits),
      config.currencyDigits,
    ),
    marginalRate,
    effectiveRate: annualIncome ? (amount / annualIncome) * 100 : 0,
    scaledRow: row.shares !== shares,
  };
}
/** Deterministic calendar payments. Split annual tax in cents so a full year's payments sum exactly. */
export function taxDue(
  payment: TaxPayment,
  date: string,
  amount: number,
  digits: number,
  annualAmount = false,
): number {
  if (!payment.enabled) return 0;
  const [year, month, day] = parts(date);
  if (day !== Math.min(payment.day, daysInMonth(year, month))) return 0;
  const months =
    payment.frequency === "monthly"
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : payment.frequency === "quarterly"
        ? [3, 6, 9, 12]
        : [payment.month];
  const index = months.indexOf(month);
  if (index < 0) return 0;
  const minor = toMinor(amount, digits);
  if (!annualAmount) return minor;
  return (
    Math.floor(minor / months.length) + (index < minor % months.length ? 1 : 0)
  );
}
