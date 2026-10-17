import type { InflationRate, PersonaConfig } from "../domain/types";
import { addMonths, parts } from "./calendar";

/** Completed anniversaries, clamped to month end for dates such as 31 January. */
export function completedMonths(date: string, origin: string): number {
  const [year, month] = parts(date);
  const [startYear, startMonth] = parts(origin);
  const months = (year - startYear) * 12 + month - startMonth;
  return Math.max(0, months - (addMonths(origin, months) > date ? 1 : 0));
}

/** Amounts are base prices on origin; the first adjustment follows one full period. */
export function inflationFactor(
  setting: InflationRate | undefined,
  date: string,
  origin: string,
): number {
  if (!setting?.rate) return 1;
  const months = completedMonths(date, origin);
  const periods =
    setting.period === "monthly" ? months : Math.floor(months / 12);
  return (1 + setting.rate / 100) ** periods;
}

export function budgetInflationFactor(
  config: PersonaConfig,
  category: string,
  date: string,
): number {
  return inflationFactor(
    config.inflation?.budgetOverrides?.[category] ?? config.inflation,
    date,
    config.startDate,
  );
}

export function chargeInflationFactor(
  config: PersonaConfig,
  chargeId: string,
  date: string,
  origin = config.startDate,
): number {
  return inflationFactor(
    config.inflation?.chargeOverrides?.[chargeId] ?? config.inflation,
    date,
    origin,
  );
}
