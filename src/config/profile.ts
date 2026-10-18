import { migrateCategorySystem } from "./category-migration";
import type { ConfigurationFile, PersonaConfig } from "../domain/types";
import { defaultIncomeTax, defaultTaxSystem } from "../engine/taxes";
import { differenceDays } from "../engine/calendar";
import { referenceHash } from "./canonical";
import { effectivePaymentCards } from "./payment-cards";

/** Accept old files, but omit retired persona controls from current settings. */
export function stripLegacySettings(config: PersonaConfig): PersonaConfig {
  const c = structuredClone(config);
  delete c.countryCode;
  delete c.region;
  delete c.urbanity;
  delete c.family;
  delete c.riskProfile;
  delete c.bankFees;
  c.paymentCards = effectivePaymentCards(c);
  c.defaultPaymentCardId ??= c.paymentCards[0]?.id;
  return c;
}
export function modernizeScenario(file: ConfigurationFile): ConfigurationFile {
  const next = migrateCategorySystem(file);
  next.configuration = stripLegacySettings(next.configuration);
  next.configuration.costOfLiving ??= 1;
  next.configuration.displayCurrency ??= next.configuration.currency;
  next.configuration.locationDescription ??= "";
  next.configuration.incomeTax ??= defaultIncomeTax();
  next.configuration.otherTaxes ??= [];
  for (const mode of next.configuration.spendingModes ?? []) {
    if (mode.endDate) {
      const days =
        differenceDays(
          mode.endDate,
          mode.startDate ?? next.configuration.startDate,
        ) + 1;
      mode.duration = Math.max(1, Math.min(7300, mode.duration ?? days, days));
      delete mode.endDate;
    }
    mode.duration ??= 30;
  }
  next.reference.taxSystem ??= defaultTaxSystem();
  next.referenceHash = referenceHash(next.reference);
  return next;
}
