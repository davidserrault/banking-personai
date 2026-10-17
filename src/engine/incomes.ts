import type { Income, PersonaConfig, PlannedEvent } from "../domain/types";
import {
  addDays,
  addMonths,
  dates,
  differenceDays,
  elapsedYears,
  makeDate,
  parts,
  weekday,
} from "./calendar";
import { eventOccurrences } from "./events";
import { random } from "./random";
import { toMinor } from "./money";

export const annualFrequency = (frequency: string): number =>
  ({
    once: 0,
    daily: 365.2425,
    weekly: 365.2425 / 7,
    fortnightly: 365.2425 / 14,
    monthly: 12,
    quarterly: 4,
    semiannual: 2,
    annual: 1,
  })[frequency] ?? 12;
export const monthlyIncome = (incomes: Income[]): number =>
  incomes.reduce(
    (sum, i) =>
      sum + (i.enabled ? (i.amount * annualFrequency(i.frequency)) / 12 : 0),
    0,
  );
export interface ScheduledIncome {
  date: string;
  nominalDate: string;
  income: Income;
  amountMinor: number;
}
export function scheduleIncomes(
  config: PersonaConfig,
  endExclusive: string,
  events: readonly PlannedEvent[] = eventOccurrences(
    config.plannedEvents,
    endExclusive,
  ),
): Map<string, ScheduledIncome[]> {
  const result = new Map<string, ScheduledIncome[]>();
  const changes = events
    .filter(
      (e) =>
        e.enabled && e.type === "durable-change" && e.change.kind === "salary",
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
    );
  const gaps = events.filter((e) => e.enabled && e.type === "income-gap");
  for (const income of config.incomes.filter(
    (i) => i.enabled && i.amount >= 0,
  )) {
    const nominal: string[] = [];
    const interval =
      income.frequency === "once"
        ? 1
        : 365.2425 / annualFrequency(income.frequency);
    const padding = Math.ceil((interval * income.frequencyVariation) / 100) + 2;
    const lo = addDays(config.startDate, -padding),
      hi = addDays(endExclusive, padding);
    if (income.frequency === "once")
      nominal.push(income.startDate ?? config.startDate);
    else if (["daily", "weekly", "fortnightly"].includes(income.frequency)) {
      for (const date of dates(lo, hi)) {
        if (
          income.frequency === "daily" ||
          (income.frequency === "weekly" &&
            (weekday(date) || 7) === income.day) ||
          (income.frequency === "fortnightly" &&
            ((differenceDays(date, addDays("2000-01-03", income.day - 1)) %
              14) +
              14) %
              14 ===
              0)
        )
          nominal.push(date);
      }
    } else {
      const [y, m] = parts(lo);
      const months =
        { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[
          income.frequency
        ] ?? 1;
      for (
        let first = makeDate(y, m, 1);
        first < hi;
        first = addMonths(first, 1)
      ) {
        const [year, month] = parts(first);
        if ((((month - income.month) % months) + months) % months === 0)
          nominal.push(makeDate(year, month, income.day));
      }
    }
    for (const nominalDate of nominal) {
      const dateRandom = random(
        `${config.seed}|income|${income.id}|${nominalDate}|date`,
      )();
      const date = addDays(
        nominalDate,
        Math.round(
          ((dateRandom * 2 - 1) * interval * income.frequencyVariation) / 100,
        ),
      );
      if (
        date < config.startDate ||
        date >= endExclusive ||
        (income.startDate && date < income.startDate) ||
        (income.endDate && date > income.endDate)
      )
        continue;
      const salaryChange =
        income.main && income.frequency !== "once"
          ? changes.filter((e) => e.startDate <= date).at(-1)
          : undefined;
      const base = salaryChange
        ? (salaryChange.change.salary * 12) / annualFrequency(income.frequency)
        : income.amount;
      const origin = salaryChange?.startDate ?? config.startDate;
      const retained = gaps
        .filter(
          (e) =>
            date >= e.startDate &&
            date < addDays(e.startDate, e.durationDays) &&
            (income.main || e.incomeScope === "all"),
        )
        .reduce((r, e) => Math.min(r, e.incomeRemainingPercent / 100), 1);
      const amountRandom = random(
        `${config.seed}|income|${income.id}|${nominalDate}|amount`,
      )();
      const amountMinor = toMinor(
        base *
          (1 + income.annualGrowth / 100) ** elapsedYears(date, origin) *
          (1 + ((amountRandom * 2 - 1) * income.amountVariation) / 100) *
          retained,
        config.currencyDigits,
      );
      if (amountMinor <= 0) continue;
      const entry = { date, nominalDate, income, amountMinor };
      result.set(date, [...(result.get(date) ?? []), entry]);
    }
  }
  for (const entries of result.values())
    entries.sort(
      (a, b) =>
        a.income.id.localeCompare(b.income.id) ||
        a.nominalDate.localeCompare(b.nominalDate),
    );
  return result;
}
