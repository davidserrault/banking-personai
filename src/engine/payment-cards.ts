import type { PaymentCard } from "../domain/types";
import { daysInMonth, parts, weekday } from "./calendar";
import { toMinor } from "./money";

export function cardBillingDue(card: PaymentCard, date: string): boolean {
  const [year, month, day] = parts(date);
  return day === Math.min(card.settlementDay, daysInMonth(year, month));
}
export function cardRepaymentDue(card: PaymentCard, date: string): boolean {
  if (card.type === "deferred-debit") return cardBillingDue(card, date);
  const [year, month, day] = parts(date);
  if (card.repaymentFrequency === "weekly")
    return weekday(date) === card.repaymentDay % 7;
  if (day !== Math.min(card.repaymentDay, daysInMonth(year, month)))
    return false;
  if (card.repaymentFrequency === "quarterly")
    return (month - card.repaymentMonth + 12) % 3 === 0;
  if (card.repaymentFrequency === "annual")
    return month === card.repaymentMonth;
  return true;
}
export function cardRepaymentMinor(
  card: PaymentCard,
  outstanding: number,
  digits: number,
): number {
  if (outstanding <= 0) return 0;
  if (card.type === "deferred-debit") return outstanding;
  const due =
    card.repaymentMode === "amount"
      ? toMinor(card.repaymentAmount, digits)
      : card.repaymentPercent > 0
        ? Math.max(1, Math.round((outstanding * card.repaymentPercent) / 100))
        : 0;
  return Math.min(outstanding, due);
}
