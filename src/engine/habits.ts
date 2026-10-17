import type {
  Assumptions,
  CountryMerchantReference,
  PersonaConfig,
} from "../domain/types";
import { addDays, makeDate, parts } from "./calendar";
import { consumptionProfile, seasonalFactors } from "./consumption";
import { random } from "./random";

export interface Habit {
  date: string;
  category: string;
  amount: number;
  label: string;
  protected: boolean;
  ownerOnly?: boolean;
}
export function planHabits(
  config: PersonaConfig,
  reference: CountryMerchantReference,
  endDate: string,
  assumptions?: Assumptions,
): Map<string, Habit[]> {
  const result = new Map<string, Habit[]>();
  if (assumptions && !assumptions.consumption) return result;
  const profile = consumptionProfile(config, assumptions),
    costMultiplier = config.costOfLiving ?? 1;
  for (
    let year = parts(config.startDate)[0];
    year <= parts(endDate)[0];
    year++
  ) {
    const rng = random(`${config.seed}|habits|${year}`);
    const randomMonth = () => 1 + Math.floor(rng() * 12);
    const schedule = (
      enabled: boolean,
      month: number,
      base: number,
      category: string,
      label: string,
      protectedExpense = false,
      ownerOnly = false,
      day?: number,
    ) => {
      if (!enabled) return;
      const date = makeDate(year, month, day ?? 2 + Math.floor(rng() * 25));
      const amount =
        base *
        costMultiplier *
        (protectedExpense ? 1 : config.discretionary) *
        seasonalFactors(config, category, month, assumptions).amount *
        (0.75 + rng() * 0.5);
      if (date >= config.startDate && date <= endDate)
        result.set(date, [
          ...(result.get(date) ?? []),
          {
            date,
            category,
            amount,
            label,
            protected: protectedExpense,
            ownerOnly,
          },
        ]);
    };
    schedule(
      config.events.school && config.children > 0,
      9,
      55 * config.children,
      "shopping",
      "School start",
      true,
    );
    schedule(
      config.events.schoolTrip && config.children > 0 && rng() < 0.7,
      5,
      55 * config.children,
      "leisure",
      "School trip",
      true,
    );
    schedule(
      config.events.birthday,
      randomMonth(),
      16 * config.household,
      "restaurants",
      "Birthday meal",
    );
    schedule(
      config.events.appliance && rng() < 0.45,
      randomMonth(),
      170,
      "home",
      "Appliance repair",
    );
    schedule(
      config.events.gifts,
      12,
      40 * config.household,
      "shopping",
      "Year-end gifts",
    );
    schedule(
      config.events.equipment && rng() < 0.65,
      randomMonth(),
      160,
      "home",
      "Home equipment",
    );
    schedule(
      config.events.homeRepair && rng() < 0.65,
      4 + Math.floor(rng() * 6),
      210,
      "home",
      "Home maintenance",
      false,
      true,
    );
    for (let month = 1; month <= 12; month++) {
      if (
        config.events.travel &&
        rng() <
          0.095 * seasonalFactors(config, "travel", month, assumptions).volume
      ) {
        const day = 5 + Math.floor(rng() * 18),
          city =
            config.travelCities[
              Math.floor(rng() * config.travelCities.length)
            ] ?? "Regional destination";
        schedule(
          true,
          month,
          65 * config.household * profile.factor,
          "travel",
          `Occasional trip · ${city}`,
          false,
          false,
          day,
        );
        const next = parts(addDays(makeDate(year, month, day), 1));
        schedule(
          true,
          next[1],
          18 * config.household,
          "restaurants",
          `Trip meal · ${city}`,
          false,
          false,
          next[2],
        );
      }
    }
  }
  return result;
}
