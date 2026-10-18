/** Import-only adapter for configurations authored before the Bridge taxonomy. */
import type {
  Assumptions,
  CountryMerchantReference,
  Merchant,
  PersonaConfig,
} from "../domain/types";
import categoryData from "../../specifications/reference/legacy-categories.json";
import profilesData from "../../specifications/reference/legacy-consumption-profiles.json";
import seasonalData from "../../specifications/reference/seasonality-combined.json";
import mappingData from "../../specifications/reference/legacy-seasonality-category-mapping.json";
import { fromMinor, toMinor } from "../engine/money";
import { budgetInflationFactor } from "../engine/inflation";

export const categories = categoryData;
interface Profile {
  id: string;
  factor: number;
  budgets: Partial<Record<string, number>>;
  basket: number;
  basketOverrides?: Partial<Record<string, number>>;
  affinity: Partial<Record<string, number>>;
}
export interface HouseholdState {
  household: number;
  eligibleChildren: number;
  car: boolean;
  prices?: Record<string, number>;
}
export function consumptionProfile(
  config: PersonaConfig,
  assumptions?: Assumptions,
): Profile {
  const values =
    assumptions?.consumption?.profiles ?? (!assumptions ? profilesData : []);
  return (
    (values as Profile[]).find((p) => p.id === config.style) ?? {
      id: config.style,
      factor: 1,
      budgets: {},
      basket: 1,
      affinity: {},
    }
  );
}
export function monthlyEnvelopes(
  config: PersonaConfig,
  reference: CountryMerchantReference,
  assumptions?: Assumptions,
  state?: HouseholdState,
  date = config.startDate,
): Record<string, number> {
  const profile = consumptionProfile(config, assumptions);
  const calibrated = assumptions ? Boolean(assumptions.consumption) : true;
  const household = state?.household ?? config.household,
    children = state?.eligibleChildren ?? config.children;
  return Object.fromEntries(
    categories.map((category) => {
      let profileFactor = profile.budgets[category.key] ?? profile.factor;
      if (["taxes", "bankfees", "incidentfees"].includes(category.key))
        profileFactor = 1;
      if (category.key === "health" && calibrated)
        profileFactor = Math.max(
          profileFactor,
          config.age < 40
            ? 1
            : config.age < 60
              ? 352 / 206
              : config.age < 70
                ? 443 / 206
                : 590 / 206,
        );
      const householdFactor = !calibrated
        ? 1
        : ["groceries", "bakery"].includes(category.key)
          ? (1 + 0.35 * (household - 1)) / 2.05
          : category.key === "health"
            ? household / 4
            : category.key === "childrenActivities"
              ? children / 2
              : 1;
      const override = config.budgetOverrides?.[category.key];
      const base =
        override ??
        (config.budgets[category.key] ?? 0) *
          householdFactor *
          profileFactor *
          (category.protected ? 1 : config.discretionary);
      const gated =
        (category.key === "fuel" && !(state?.car ?? config.car)) ||
        (category.key === "taxes" && config.incomeTax)
          ? 0
          : base *
            (config.costOfLiving ?? 1) *
            budgetInflationFactor(config, category.key, date);
      return [
        category.key,
        fromMinor(toMinor(gated, config.currencyDigits), config.currencyDigits),
      ];
    }),
  );
}
export function seasonalFactors(
  config: PersonaConfig,
  category: string,
  month: number,
  assumptions?: Assumptions,
): { volume: number; amount: number; target: number } {
  if (!config.seasonality.enabled || (assumptions && !assumptions.seasonality))
    return { volume: 1, amount: 1, target: 1 };
  const mapping = (assumptions?.seasonality?.mapping ?? mappingData) as Record<
    string,
    { series: string }
  >;
  const combined = (assumptions?.seasonality?.combined ??
    seasonalData) as Record<string, { normalizedVolume: number[] }>;
  const ratio =
    combined[mapping[category]?.series]?.normalizedVolume[month - 1] ?? 1;
  const volume = Math.max(
    0,
    1 + (ratio - 1) * config.seasonality.volumeStrength,
  );
  const amount = Math.max(
    0,
    1 + (ratio - 1) * config.seasonality.amountStrength,
  );
  return { volume, amount, target: volume * amount };
}
export interface MerchantRate {
  merchant: Merchant;
  mean: number;
  frequency: number;
  weight: number;
  eligible: boolean;
}
export function merchantRates(
  config: PersonaConfig,
  reference: CountryMerchantReference,
  assumptions?: Assumptions,
  state?: HouseholdState,
  date = config.startDate,
): MerchantRate[] {
  const envelopes = monthlyEnvelopes(
      { ...config, costOfLiving: 1 },
      reference,
      assumptions,
      state,
    ),
    profile = consumptionProfile(config, assumptions);
  const preferences = config.preferredMerchants.map((m) =>
    m.toLocaleLowerCase("en-GB"),
  );
  const rows = reference.merchants.map((merchant) => {
    const override =
      config.merchantOverrides?.[
        `${reference.id}|${config.style}|${merchant.id}`
      ];
    const frequency =
      override?.frequency ?? merchant.monthlyFrequencyByProfile?.[config.style];
    const affinity = profile.affinity[merchant.segment ?? "everyday"] ?? 1;
    const preferred = preferences.includes(
      merchant.name.toLocaleLowerCase("en-GB"),
    )
      ? 2
      : 1;
    const weight =
      (affinity > 0
        ? affinity
        : frequency !== undefined && frequency > 0
          ? 1
          : 0) * preferred;
    const car = state?.car ?? config.car;
    const transportEligible =
      merchant.category !== "transport" ||
      merchant.scenario ||
      (car
        ? !/ratp|tcl|ilévia|bus|métro|metro|tram|urbain/i.test(merchant.name)
        : !/péage|peage|parking|autorout|vinci/i.test(merchant.name));
    const eligible =
      !merchant.travelOnly &&
      !(merchant.category === "taxes" && config.incomeTax) &&
      transportEligible &&
      (merchant.category !== "fuel" || car) &&
      (merchant.category !== "childrenActivities" ||
        (state?.eligibleChildren ?? config.children) > 0) &&
      weight > 0;
    const basket = ["taxes", "bankfees", "incidentfees"].includes(
      merchant.category,
    )
      ? 1
      : (profile.basketOverrides?.[merchant.category] ?? profile.basket);
    const baseMean = fromMinor(
      toMinor(override?.mean ?? merchant.mean * basket, config.currencyDigits),
      config.currencyDigits,
    );
    const mean = Math.max(
      10 ** -config.currencyDigits,
      fromMinor(
        toMinor(
          baseMean *
            (config.costOfLiving ?? 1) *
            budgetInflationFactor(config, merchant.category, date),
          config.currencyDigits,
        ),
        config.currencyDigits,
      ),
    );
    return {
      merchant,
      mean,
      baseMean,
      frequency: frequency ?? -1,
      weight,
      eligible,
    };
  });
  const totals: Record<string, number> = {};
  for (const row of rows)
    if (row.eligible)
      totals[row.merchant.category] =
        (totals[row.merchant.category] ?? 0) + row.weight;
  return rows.map(({ baseMean, ...row }) => ({
    ...row,
    frequency: row.eligible
      ? row.frequency >= 0
        ? row.frequency
        : ((envelopes[row.merchant.category] ?? 0) * row.weight) /
          (totals[row.merchant.category] || 1) /
          Math.max(10 ** -config.currencyDigits, baseMean)
      : 0,
  }));
}
