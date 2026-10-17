const DAY = 86_400_000;
export const dateMs = (date: string): number =>
  Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
export const isoDate = (value: number | Date): string =>
  new Date(value).toISOString().slice(0, 10);
export const addDays = (date: string, days: number): string =>
  isoDate(dateMs(date) + days * DAY);
export const differenceDays = (a: string, b: string): number =>
  Math.round((dateMs(a) - dateMs(b)) / DAY);
export const parts = (date: string): [number, number, number] =>
  date.slice(0, 10).split("-").map(Number) as [number, number, number];
export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();
export const makeDate = (year: number, month: number, day: number): string =>
  isoDate(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))));
export function addMonths(date: string, count: number): string {
  const [y, m, d] = parts(date);
  const target = new Date(Date.UTC(y, m - 1 + count, 1));
  return makeDate(target.getUTCFullYear(), target.getUTCMonth() + 1, d);
}
export const weekday = (date: string): number =>
  new Date(dateMs(date)).getUTCDay();
export function nextWeekday(date: string): string {
  let next = addDays(date, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
  return next;
}
export function elapsedYears(date: string, origin: string): number {
  let years = parts(date)[0] - parts(origin)[0];
  if (addMonths(origin, years * 12) > date) years--;
  const anniversary = addMonths(origin, years * 12);
  return (
    years +
    differenceDays(date, anniversary) /
      differenceDays(addMonths(origin, (years + 1) * 12), anniversary)
  );
}
export function* dates(start: string, endExclusive: string): Generator<string> {
  for (let d = start; d < endExclusive; d = addDays(d, 1)) yield d;
}
export const stamp = (date: string): string => `${date.slice(0, 10)}T00:00:00`;
