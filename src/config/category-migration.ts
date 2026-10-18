import type {
  Assumptions,
  ConfigurationFile,
  CountryMerchantReference,
  Merchant,
  PersonaConfig,
} from "../domain/types";
import { categories, categoryByKey, categoryById } from "../domain/categories";
import { referenceHash } from "./canonical";
import {
  merchantRates as legacyRates,
  monthlyEnvelopes as legacyEnvelopes,
} from "./legacy-consumption";

/** Legacy numeric IDs overlap Bridge IDs. Only the explicit marker disambiguates them. */
export const legacyCategoryKeys: Record<string, string> = {
  groceries: "groceries",
  bakery: "foodOthers",
  fuel: "fuel",
  transport: "publicTransport",
  health: "healthOthers",
  restaurants: "restaurants",
  coffee: "coffee",
  shopping: "shoppingOthers",
  leisure: "amusements",
  home: "homeImprovement",
  digital: "subscriptionOthers",
  travel: "travel",
  hotels: "hotels",
  fastfood: "fastfood",
  bars: "bars",
  alcohol: "foodOthers",
  cycling: "sportingGoods",
  taxes: "taxes",
  bankfees: "bankfees",
  incidentfees: "incidentfees",
  ridehailing: "autoOthers",
  childrenActivities: "educationOthers",
  luxury: "clothing",
};
export function migrateCategoryKey(key: string): string {
  return legacyCategoryKeys[key] ?? key;
}
export function migrateMerchantCategory(
  m: Pick<Merchant, "category" | "name">,
): string {
  const k = m.category,
    n = m.name.toLowerCase();
  if (k === "transport")
    return /parking|stationnement/.test(n)
      ? "parking"
      : /péage|peage|autorout|vinci/.test(n)
        ? "tolls"
        : /sncf|train|eurostar/.test(n)
          ? "trainTicket"
          : "publicTransport";
  if (k === "health")
    return /pharmac/.test(n)
      ? "pharmacy"
      : /dent/.test(n)
        ? "dentist"
        : /optici/.test(n)
          ? "optician"
          : /médec|medec|doctor/.test(n)
            ? "doctor"
            : "healthOthers";
  if (k === "shopping" || k === "luxury")
    return /fnac|darty|apple|samsung|boulanger\b/.test(n)
      ? "highTech"
      : /librair|livre|book/.test(n)
        ? "books"
        : /decathlon|sport|vélo|velo/.test(n)
          ? "sportingGoods"
          : /zara|h&m|uniqlo|kiabi|vinted|vetement|vêtement|primark|louis vuitton|dior|chanel|hermès|hermes|luxe|créateur/.test(
                n,
              ) || k === "luxury"
            ? "clothing"
            : "shoppingOthers";
  if (k === "digital")
    return /spotify|deezer/.test(n)
      ? "music"
      : /netflix|cinéma|cinema/.test(n)
        ? "movies"
        : "subscriptionOthers";
  if (k === "leisure")
    return /cinéma|cinema|musée|musee|culture|théâtre|theatre/.test(n)
      ? "arts"
      : /sport|piscine/.test(n)
        ? "sports"
        : "amusements";
  if (k === "travel")
    return /sncf|train|eurostar/.test(n)
      ? "trainTicket"
      : /air france|easyjet|ryanair|avion|flight/.test(n)
        ? "planeTicket"
        : "travel";
  return migrateCategoryKey(k);
}
function migrateCharge(c: {
  id: string;
  name: string;
  categoryId: number;
}): number {
  const n = `${c.id} ${c.name}`.toLowerCase();
  if (/habitation|home insurance/.test(n)) return 246;
  if (/auto.*assur|assur.*auto|car insurance/.test(n)) return 247;
  if (/mutuelle|health insurance/.test(n)) return 245;
  if (/assur|insurance|borrower/.test(n)) return 278;
  if (/internet|fibre|fiber|broadband/.test(n)) return 180;
  if (/mobile|phone|téléphone|telephone/.test(n)) return 277;
  if (/netflix|spotify|abonn|subscription|digital/.test(n)) return 280;
  if (/élect|electr/.test(n)) return 217;
  if (/\bgaz\b|\bgas\b/.test(n)) return 218;
  if (/water|\beau\b/.test(n)) return 293;
  if (/energy|énergie|energie/.test(n)) return 328;
  if (/housing|rent|loyer|logement/.test(n))
    return c.categoryId === 800 && /mortgage|crédit|credit|emprunt/.test(n)
      ? 89
      : 216;
  if (/transport|navigo/.test(n)) return 196;
  return (
    (
      {
        14: 273,
        116: 188,
        36: 87,
        115: 196,
        49: 268,
        84: 83,
        79: 313,
        64: 186,
        75: 269,
        29: 220,
        18: 280,
        339: 249,
        98: 263,
        71: 260,
        9010: 227,
        9011: 188,
        9012: 262,
        837: 302,
        59: 79,
        9013: 756587,
        9014: 84,
        9015: 237,
        9016: 272,
        859: 3,
        54: 278,
        328: 328,
        800: 89,
        212: 326,
        9000: 441894,
        9002: 276,
        9004: 267,
      } as Record<number, number>
    )[c.categoryId] ?? c.categoryId
  );
}
function remap<T>(
  value: Record<string, T | undefined> | undefined,
): Record<string, T> | undefined {
  if (!value) return value;
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const target = migrateCategoryKey(k);
    if (Object.hasOwn(result, target) && typeof v === "number")
      result[target] = (Number(result[target]) + v) as T;
    else result[target] = structuredClone(v);
  }
  return result;
}
export function migrateReference(
  input: CountryMerchantReference,
): CountryMerchantReference {
  const ref = structuredClone(input);
  if (ref.categorySystem === "bridge") return ref;
  ref.merchants.forEach((m) => (m.category = migrateMerchantCategory(m)));
  if (ref.settings) {
    ref.settings.budgets = remap(ref.settings.budgets)!;
    ref.settings.budgetOverrides = remap(ref.settings.budgetOverrides);
  }
  ref.categorySystem = "bridge";
  if (!ref.sources.some((s) => s.url === "https://www.bridgeapi.io/"))
    ref.sources.push({
      title: "Bridge · Transaction categories",
      url: "https://www.bridgeapi.io/",
      note: "Category hierarchy and identifiers: https://docs.bridgeapi.io/docs/transactions-categories",
    });
  return ref;
}
export function migrateCategorySystem(
  input: ConfigurationFile,
): ConfigurationFile {
  const file = structuredClone(input);
  if (file.configuration?.categorySystem === "bridge") return file;
  const c = file.configuration,
    ref = file.reference,
    assumptions = file.assumptions;
  if (!c || !ref || !assumptions) return file;
  const rates = legacyRates(c, ref, assumptions);
  const baseRates = new Map(
    legacyRates({ ...c, costOfLiving: 1 }, ref, assumptions).map((r) => [
      r.merchant.id,
      r.mean,
    ]),
  );
  const oldBudgets = legacyEnvelopes(c, ref, assumptions);
  const migratedRef = migrateReference(ref);
  const merchantMap = new Map(
    migratedRef.merchants.map((m) => [m.id, m.category]),
  );
  // Allocate each legacy envelope by its existing merchant purchase patterns.
  const allocations: Record<string, Record<string, number>> = {};
  for (const r of rates) {
    const key = merchantMap.get(r.merchant.id)!;
    if (r.eligible)
      (allocations[r.merchant.category] ??= {})[key] =
        (allocations[r.merchant.category]?.[key] ?? 0) + r.mean * r.frequency;
  }
  const budgets: Record<string, number> = {};
  const destinations = (key: string) =>
    Object.keys(allocations[key] ?? {}).length
      ? Object.keys(allocations[key])
      : [migrateCategoryKey(key)];
  for (const [old, value] of Object.entries(oldBudgets)) {
    const targets = destinations(old),
      weights = allocations[old] ?? {};
    const sum = Object.values(weights).reduce((s, n) => s + n, 0);
    let remaining = Math.round(value * 10 ** c.currencyDigits);
    targets.forEach((key, index) => {
      const amount =
        index === targets.length - 1
          ? remaining
          : Math.min(
              remaining,
              Math.round(
                value *
                  10 ** c.currencyDigits *
                  (sum ? (weights[key] ?? 0) / sum : 1 / targets.length),
              ),
            );
      remaining -= amount;
      budgets[key] = (budgets[key] ?? 0) + amount / 10 ** c.currencyDigits;
    });
  }
  const scale = 10 ** c.currencyDigits;
  c.budgets = Object.fromEntries(
    Object.entries(budgets).map(([key, v]) => [
      key,
      Math.round((v / (c.costOfLiving ?? 1)) * scale) / scale,
    ]),
  );
  c.budgetOverrides = structuredClone(c.budgets);
  c.merchantOverrides = { ...c.merchantOverrides };
  for (const r of rates)
    c.merchantOverrides[`${ref.id}|${c.style}|${r.merchant.id}`] = {
      mean: baseRates.get(r.merchant.id)!,
      frequency: r.frequency,
    };
  c.charges.forEach((charge) => (charge.categoryId = migrateCharge(charge)));
  c.incomes.forEach((i) => {
    const label = i.label.toLowerCase();
    i.categoryId ??=
      i.kind === "refund"
        ? 283
        : i.kind === "bonus"
          ? 233
          : /retrait|retire/.test(label)
            ? 279
            : /grant|scholarship|bourse/.test(label)
              ? 441893
              : /pension/.test(label)
                ? 327
                : /salaire|salary|wage/.test(label) || i.kind === "salary"
                  ? 230
                  : 3;
  });
  for (const event of c.plannedEvents) {
    event.category = migrateCategoryKey(event.category);
    event.change.categories = [
      ...new Set(event.change.categories.flatMap(destinations)),
    ];
  }
  for (const mode of c.spendingModes ?? []) {
    mode.categoryRules = Object.fromEntries(
      Object.entries(mode.categoryRules).flatMap(([key, rule]) =>
        destinations(key).map((target) => [
          target,
          {
            ...rule,
            ...(rule.substituteTo
              ? { substituteTo: migrateCategoryKey(rule.substituteTo) }
              : {}),
          },
        ]),
      ),
    );
    for (const rule of [
      ...mode.activationTriggers.rules,
      ...mode.deactivationTriggers.rules,
    ])
      if (rule.category) rule.category = migrateCategoryKey(rule.category);
  }
  if (c.inflation?.budgetOverrides)
    c.inflation.budgetOverrides = Object.fromEntries(
      Object.entries(c.inflation.budgetOverrides).flatMap(([key, rate]) =>
        destinations(key).map((target) => [target, rate]),
      ),
    );
  c.categorySystem = "bridge";
  file.reference = migratedRef;
  if (assumptions.consumption) {
    for (const profile of assumptions.consumption.profiles) {
      profile.budgets = remap(profile.budgets)!;
      profile.basketOverrides = remap(profile.basketOverrides)!;
    }
    assumptions.consumption.categoryBases = categories.map(
      ({ key, id, name, protected: p, monthly }) => ({
        key,
        id,
        name,
        protected: p,
        monthly,
      }),
    );
    assumptions.consumption.observedBudgetShares = remap(
      assumptions.consumption.observedBudgetShares,
    )!;
  }
  if (assumptions.seasonality) {
    const mapping = assumptions.seasonality.mapping;
    const next: typeof mapping = {};
    for (const [key, v] of Object.entries(mapping))
      for (const target of destinations(key)) next[target] ??= v;
    assumptions.seasonality.mapping = next;
  }
  file.referenceHash = referenceHash(file.reference);
  return file;
}
