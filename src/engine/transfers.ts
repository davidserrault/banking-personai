import type { AccountTransfer } from "../domain/types";
import { addMonths, differenceDays, parts } from "./calendar";

export function transferScheduledOn(
  rule: AccountTransfer,
  date: string,
): boolean {
  if (date < rule.startDate || (rule.endDate && date > rule.endDate))
    return false;
  if (rule.recurrence === "once") return date === rule.startDate;
  if (rule.recurrence === "weekly")
    return differenceDays(date, rule.startDate) % 7 === 0;
  const [y, m] = parts(date),
    [sy, sm] = parts(rule.startDate);
  const months = (y - sy) * 12 + m - sm;
  const step =
    rule.recurrence === "monthly"
      ? 1
      : rule.recurrence === "quarterly"
        ? 3
        : 12;
  return months % step === 0 && addMonths(rule.startDate, months) === date;
}

export interface TransferSnapshot {
  date: string;
  balances: Record<string, number>;
  averageBalances: Record<string, number>;
  monthlyIncome: number;
  averageMonthlyIncome: number;
  incomeToday: number;
}

/** Evaluate all rules against one pre-transfer snapshot, avoiding same-day trigger chains. */
export class TransferRuntime {
  private states = new Map<string, { fired: boolean; lastAttempt?: string }>();
  constructor(private rules: AccountTransfer[]) {}
  due(s: TransferSnapshot): AccountTransfer[] {
    return this.rules.filter((rule) => {
      if (
        !rule.enabled ||
        s.date < rule.startDate ||
        (rule.endDate && s.date > rule.endDate)
      )
        return false;
      if (rule.timing === "scheduled") return transferScheduledOn(rule, s.date);
      const t = rule.trigger;
      const balance = s.balances[t.account] ?? 0;
      const average = s.averageBalances[t.account] ?? balance;
      const match =
        t.kind === "balance-below"
          ? balance < t.threshold
          : t.kind === "balance-above"
            ? balance > t.threshold
            : t.kind === "balance-above-average"
              ? balance > average + (Math.abs(average) * t.threshold) / 100
              : s.monthlyIncome >
                s.averageMonthlyIncome * (1 + t.threshold / 100);
      const state = this.states.get(rule.id) ?? { fired: false };
      this.states.set(rule.id, state);
      if (!match) {
        state.fired = false;
        return false;
      }
      if (
        state.fired ||
        (t.kind === "income-above-average" && s.incomeToday <= 0) ||
        (state.lastAttempt &&
          differenceDays(s.date, state.lastAttempt) < t.cooldownDays)
      )
        return false;
      state.fired = true;
      state.lastAttempt = s.date;
      return true;
    });
  }
}
