/** All financial postings are integer settlement-currency minor units. */
export function toMinor(amount: number, digits = 2): number {
  if (!Number.isFinite(amount)) throw new Error("Money must be finite.");
  const result =
    Math.round((Math.abs(amount) + Number.EPSILON) * 10 ** digits) *
    Math.sign(amount);
  if (!Number.isSafeInteger(result))
    throw new Error("Money exceeds the safe integer range.");
  return result;
}
export const fromMinor = (amount: number, digits = 2): number =>
  amount / 10 ** digits;

/** Stable largest remainder allocation; ties resolve by original candidate order. */
export function allocateMinor(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Allocation requires a nonnegative integer.");
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const raw = weights.map(
    (w) => total * (sum > 0 ? Math.max(0, w) / sum : 1 / weights.length),
  );
  const amounts = raw.map(Math.floor);
  const order = raw
    .map((v, i) => ({ i, remainder: v - amounts[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (
    let i = 0, rest = total - amounts.reduce((a, b) => a + b, 0);
    i < rest;
    i++
  )
    amounts[order[i % order.length].i]++;
  return amounts;
}
