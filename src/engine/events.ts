import type { PlannedEvent } from "../domain/types";
import { addMonths } from "./calendar";

export interface EventOccurrence extends PlannedEvent {
  sourceEventId: string;
  sourceIndex: number;
}

/** Expand validated schedules without changing the saved event definitions.
 * Every date is anchored to the original date, avoiding month-end/leap-year drift.
 */
export function eventOccurrences(
  events: readonly PlannedEvent[],
  endExclusive: string,
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const usedIds = new Set(events.map((event) => event.id));
  events.forEach((event, sourceIndex) => {
    if (!event.enabled) return;
    const months =
      event.recurrence === "monthly"
        ? 1
        : event.recurrence === "yearly"
          ? 12
          : 0;
    for (let index = 0; ; index++) {
      const startDate = index
        ? addMonths(event.startDate, index * months)
        : event.startDate;
      if (startDate >= endExclusive) break;
      let id = event.id;
      if (index) {
        id = `${event.id}@${startDate}`;
        while (usedIds.has(id)) id += "@";
        usedIds.add(id);
      }
      occurrences.push({
        ...event,
        id,
        startDate,
        sourceEventId: event.id,
        sourceIndex,
      });
      if (!months) break;
    }
  });
  return occurrences.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  );
}
