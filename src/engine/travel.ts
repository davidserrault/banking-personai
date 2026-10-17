import type {
  CountryMerchantReference,
  PersonaConfig,
  PlannedEvent,
} from "../domain/types";
import destinations from "../../specifications/reference/travel-destinations.json";
import tripMerchants from "../../specifications/reference/travel-merchants.json";
import { addDays } from "./calendar";
import { allocateMinor, fromMinor, toMinor } from "./money";
import { random } from "./random";
import type { FXDetails } from "./types";

export interface TripPosting {
  date: string;
  amountMinor: number;
  label: string;
  category: string;
  merchantId?: number;
  eventId: string;
  fx?: FXDetails;
}
export interface TripPlan {
  event: PlannedEvent;
  postings: TripPosting[];
  totalMinor: number;
  originalCurrency: string;
  originalBudget: number;
}
export function planTrip(
  config: PersonaConfig,
  reference: CountryMerchantReference,
  event: PlannedEvent,
): TripPlan {
  const destination =
    destinations.find((d) => d.id === event.destination) ?? destinations[0];
  const abroad = event.type === "travel-abroad";
  const currency = abroad ? destination.currency : config.currency;
  const digits = abroad ? destination.digits : config.currencyDigits;
  const sameCurrency = currency === config.currency;
  const rng = random(`${config.seed}|trip|${event.id}`);
  const candidates: {
    date: string;
    category: string;
    mean: number;
    label: string;
    merchantId?: number;
    weight: number;
  }[] = [];
  for (let day = 0; day < event.durationDays; day++) {
    const kinds = ["restaurants"];
    if (day === 0) kinds.push("travel");
    if (day < event.durationDays - 1) kinds.push("hotels");
    if (day % 3 === 0) kinds.push("groceries");
    if (day % 2 === 0) kinds.push("leisure");
    for (const category of kinds) {
      const foreignMerchant = abroad
        ? tripMerchants.find(
            (m) =>
              m.destinationId === event.destination && m.category === category,
          )
        : undefined;
      const domesticMerchant = !abroad
        ? reference.merchants.find(
            (m) => m.category === category && !m.travelOnly,
          )
        : undefined;
      const merchant = foreignMerchant ?? domesticMerchant;
      const mean =
        merchant?.mean ??
        { travel: 65, hotels: 95, groceries: 20, leisure: 14, restaurants: 24 }[
          category
        ] ??
        20;
      candidates.push({
        date: addDays(event.startDate, day),
        category,
        mean,
        label: merchant?.name ?? `Trip ${category}`,
        merchantId: merchant?.id,
        weight: mean * event.travelers * (0.7 + rng() * 0.6),
      });
    }
  }
  const allocations = allocateMinor(
    toMinor(event.amount, digits),
    candidates.map((c) => c.weight),
  );
  const postings: TripPosting[] = candidates.flatMap((candidate, i) => {
    if (allocations[i] <= 0) return [];
    const original = fromMinor(allocations[i], digits);
    const baseMinor = toMinor(
      original / (sameCurrency ? 1 : event.exchangeRate),
      config.currencyDigits,
    );
    const feeMinor = sameCurrency
      ? 0
      : Math.round((baseMinor * event.fxFeePercent) / 100);
    const fx: FXDetails | undefined = abroad
      ? {
          originalAmount: -original,
          originalCurrency: currency,
          originalMinor: -allocations[i],
          exchangeRate: sameCurrency ? 1 : event.exchangeRate,
          convention: "foreign-per-settlement",
          fee: fromMinor(feeMinor, config.currencyDigits),
          feeMinor,
          baseMinor,
        }
      : undefined;
    return [
      {
        date: candidate.date,
        amountMinor: baseMinor + feeMinor,
        label: candidate.label,
        category: candidate.category,
        merchantId: candidate.merchantId,
        eventId: event.id,
        fx,
      },
    ];
  });
  return {
    event,
    postings,
    totalMinor: postings.reduce((sum, p) => sum + p.amountMinor, 0),
    originalCurrency: currency,
    originalBudget: event.amount,
  };
}
