import type { ModeTrigger, SpendingMode, TriggerGroup } from "../domain/modes";
import type { Income } from "../domain/types";
import {
  addDays,
  addMonths,
  differenceDays,
  makeDate,
  parts,
} from "./calendar";
import { random } from "./random";
export interface ModeIncome {
  amount: number;
  income: Pick<Income, "main" | "kind" | "expected" | "cadence" | "change">;
}
export interface ModeSnapshot {
  date: string;
  values: Partial<Record<ModeTrigger["metric"], number>>;
  categorySpending: Record<string, number>;
  income: ModeIncome[];
}
export function matchesTrigger(
  rule: ModeTrigger,
  snapshot: ModeSnapshot,
): boolean {
  if (rule.metric === "date") return snapshot.date === rule.date;
  if (rule.metric === "dateRange")
    return (
      !!rule.date &&
      !!rule.endDate &&
      snapshot.date >= rule.date &&
      snapshot.date <= rule.endDate
    );
  let actual = snapshot.values[rule.metric] ?? 0;
  if (rule.metric === "categorySpending")
    actual = snapshot.categorySpending[rule.category ?? ""] ?? 0;
  if (
    [
      "unexpectedIncome",
      "bonusReceived",
      "refundReceived",
      "incomeReceived",
    ].includes(rule.metric)
  ) {
    actual = snapshot.income
      .filter(({ income: i }) => {
        const kind = i.kind ?? (i.main ? "salary" : "other"),
          expected = i.expected ?? true,
          cadence = i.cadence ?? "recurring",
          change = i.change ?? "persistent";
        return (
          (rule.metric !== "unexpectedIncome" || !expected) &&
          (rule.metric !== "bonusReceived" || kind === "bonus") &&
          (rule.metric !== "refundReceived" || kind === "refund") &&
          (!rule.incomeKind ||
            rule.incomeKind === "any" ||
            rule.incomeKind === kind) &&
          (!rule.incomeExpected ||
            rule.incomeExpected === "any" ||
            (rule.incomeExpected === "expected") === expected) &&
          (!rule.incomeCadence ||
            rule.incomeCadence === "any" ||
            rule.incomeCadence === cadence) &&
          (!rule.incomeChange ||
            rule.incomeChange === "any" ||
            rule.incomeChange === change)
        );
      })
      .reduce((sum, p) => sum + p.amount, 0);
  }
  return {
    lt: actual < rule.value,
    lte: actual <= rule.value,
    gt: actual > rule.value,
    gte: actual >= rule.value,
    eq: actual === rule.value,
  }[rule.operator];
}
export function matchesGroup(
  group: TriggerGroup,
  snapshot: ModeSnapshot,
): boolean {
  return (
    group.rules.length > 0 &&
    (group.match === "all"
      ? group.rules.every((r) => matchesTrigger(r, snapshot))
      : group.rules.some((r) => matchesTrigger(r, snapshot)))
  );
}
interface Window {
  start: string;
  end?: string;
  key: string;
}
function windowFor(mode: SpendingMode, date: string, origin: string): Window {
  const base = mode.startDate ?? origin;
  let start = base;
  if (mode.recurrence !== "none" && date >= base) {
    const [y, m] = parts(date),
      [by, bm, bd] = parts(base);
    if (mode.recurrence === "monthly") {
      start = makeDate(y, m, bd);
      if (start > date) start = addMonths(base, (y - by) * 12 + m - bm - 1);
    } else {
      start = makeDate(y, bm, bd);
      if (start > date) start = makeDate(y - 1, bm, bd);
    }
  }
  let end = mode.endDate;
  if (end && mode.recurrence !== "none") {
    const [sy, sm] = parts(start),
      [by, bm] = parts(base),
      [ey, em, ed] = parts(end);
    end =
      mode.recurrence === "yearly"
        ? makeDate(sy + ey - by, em, ed)
        : addMonths(makeDate(sy, sm, ed), (ey - by) * 12 + em - bm);
  }
  return { start, end, key: mode.recurrence === "none" ? "once" : start };
}
interface ModeState {
  activated?: string;
  until?: string;
  stopped?: string;
  exitDate?: string;
  exitStrength?: number;
  usedWindow?: string;
  strength: number;
}
export interface ModeEffect {
  mode: SpendingMode;
  strength: number;
  daysActive: number;
}
/** All state belongs to one generation. Higher priority wins; suppressed modes keep their clocks. */
export class ModeRuntime {
  private states = new Map<string, ModeState>();
  constructor(
    private modes: SpendingMode[],
    private origin: string,
  ) {}
  step(snapshot: ModeSnapshot): ModeEffect | undefined {
    const { date } = snapshot;
    const candidates: ModeEffect[] = [];
    for (const mode of this.modes) {
      if (!mode.enabled || mode.intensity === 0) continue;
      const state = this.states.get(mode.id) ?? { strength: 0 };
      this.states.set(mode.id, state);
      const window = windowFor(mode, date, this.origin);
      let stoppedToday = false;
      const stop = () => {
        state.activated = undefined;
        state.exitDate = undefined;
        state.until = undefined;
        state.stopped = date;
        state.strength = 0;
        stoppedToday = true;
      };
      if (state.activated && state.until && date > state.until) stop();
      if (
        state.activated &&
        !state.exitDate &&
        matchesGroup(mode.deactivationTriggers, snapshot)
      ) {
        if (mode.transitionDuration > 0) {
          state.exitDate = date;
          state.exitStrength = state.strength;
        } else stop();
      }
      if (
        state.activated &&
        state.exitDate &&
        differenceDays(date, state.exitDate) >= mode.transitionDuration
      )
        stop();
      const gate = date >= window.start && (!window.end || date <= window.end);
      const reusable =
        mode.activationTriggers.rules.length > 0 ||
        state.usedWindow !== window.key;
      if (
        !state.activated &&
        !stoppedToday &&
        gate &&
        reusable &&
        (!state.stopped ||
          differenceDays(date, state.stopped) >= mode.cooldown) &&
        !matchesGroup(mode.deactivationTriggers, snapshot) &&
        (mode.activationTriggers.rules.length
          ? matchesGroup(mode.activationTriggers, snapshot)
          : mode.active)
      ) {
        // A scheduled active mode begins at its scheduled date even when the simulation starts later.
        const activation = mode.activationTriggers.rules.length
          ? date
          : window.start;
        const durationEnd = mode.duration
          ? addDays(activation, mode.duration - 1)
          : undefined;
        const until =
          window.end && durationEnd
            ? window.end < durationEnd
              ? window.end
              : durationEnd
            : (window.end ?? durationEnd);
        if (!until || date <= until) {
          state.activated = activation;
          state.usedWindow = window.key;
          state.until = until;
        }
      }
      if (state.activated) {
        const age = differenceDays(date, state.activated);
        let strength = mode.intensity;
        if (mode.transitionDuration) {
          strength *= Math.min(1, (age + 1) / mode.transitionDuration);
          if (state.until)
            strength *= Math.min(
              1,
              (differenceDays(state.until, date) + 1) / mode.transitionDuration,
            );
          if (state.exitDate)
            strength =
              (state.exitStrength ?? strength) *
              Math.max(
                0,
                1 -
                  (differenceDays(date, state.exitDate) + 1) /
                    mode.transitionDuration,
              );
        }
        state.strength = strength;
        if (strength > 0)
          candidates.push({ mode, strength, daysActive: age + 1 });
      }
    }
    return candidates.sort(
      (a, b) =>
        b.mode.priority - a.mode.priority || a.mode.id.localeCompare(b.mode.id),
    )[0];
  }
}
export const blend = (baseline: number, target: number, strength: number) =>
  baseline + (target - baseline) * strength;
/** Independent stream: activating a trigger never consumes ordinary purchase randomness. */
export function categoryEffect(
  effect: ModeEffect | undefined,
  category: string,
  seed: string,
  date: string,
): { amount: number; frequency: number; budget: number } {
  if (!effect || ["taxes", "bankfees", "incidentfees"].includes(category))
    return { amount: 1, frequency: 1, budget: 1 };
  const rule = effect.mode.categoryRules[category] ?? {
    amount: 1,
    frequency: 1,
  };
  const noise =
    1 +
    (random(`${seed}|mode|${effect.mode.id}|${date}|${category}`)() * 2 - 1) *
      effect.mode.randomness *
      effect.strength;
  const amount = blend(1, rule.amount, effect.strength) * noise,
    frequency = blend(1, rule.frequency, effect.strength);
  return { amount, frequency, budget: amount * frequency };
}
