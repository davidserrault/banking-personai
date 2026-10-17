import destinations from "../../specifications/reference/travel-destinations.json";
import type {
  Assumptions,
  ConfigurationFile,
  CountryMerchantReference,
  PersonaConfig,
  ValidationIssue,
} from "../domain/types";
import { exportConfiguration } from "./files";
import {
  ConfigurationError,
  validateMerchantReference,
  validateScenario,
} from "./validation";
import { destinationCountries } from "./registry";
import { monthlyEnvelopes } from "../engine/consumption";
import { stripLegacySettings } from "./profile";

export interface CountryConversionOptions {
  rate?: number;
  region?: string;
  missingCategories?: Record<string, "zero" | "inactive">;
  /** Applied effective envelopes, when supplied by the engine, keep the reviewed monthly amounts unchanged. */
  budgetAmounts?: Record<string, number>;
}
export interface CountryConversionPreview {
  configuration: PersonaConfig;
  reference: CountryMerchantReference;
  assumptions: Assumptions;
  modelId: string;
  changes: { path: string; before: number; after: number }[];
  notices: string[];
  issues: ValidationIssue[];
  inactiveCategories: { category: string; reason: string }[];
}

/** Pure preview. Never mutates the applied scenario, including on validation failure or cancellation. */
export function previewCountryConversion(
  scenario: ConfigurationFile,
  reference: CountryMerchantReference,
  options: CountryConversionOptions = {},
): CountryConversionPreview {
  const config = stripLegacySettings(scenario.configuration),
    target = structuredClone(reference),
    assumptions = structuredClone(scenario.assumptions);
  const preview: CountryConversionPreview = {
    configuration: config,
    reference: target,
    assumptions,
    modelId: scenario.modelId,
    changes: [],
    notices: [],
    issues: validateMerchantReference(target),
    inactiveCategories: [],
  };
  if (preview.issues.length) return preview;
  const changedCurrency = config.currency !== target.currency,
    changedCountry = scenario.reference.countryCode !== target.countryCode;
  const rate = changedCurrency ? options.rate : 1;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0 || rate > 1e9) {
    preview.issues.push({
      path: "conversion.rate",
      message:
        "Enter a positive fixed rate: new currency units per 1 current currency unit.",
    });
    return preview;
  }
  const scale = 10 ** target.currencyDigits;
  const convert = (value: number, path: string) => {
    const next = Math.round((value * rate + Number.EPSILON) * scale) / scale;
    if (next !== value || changedCurrency)
      preview.changes.push({ path, before: value, after: next });
    return next;
  };
  const fromCurrency = config.currency;
  if (changedCurrency) {
    for (const key of [
      "buffer",
      "overdraftLimit",
      "topupThreshold",
      "topupAmount",
    ] as const)
      config[key] = convert(config[key], key);
    config.accounts.forEach((account, i) => {
      account.openingBalance = convert(
        account.openingBalance,
        `accounts[${i}].openingBalance`,
      );
      if (account.ceiling !== null && account.ceiling !== undefined)
        account.ceiling = convert(account.ceiling, `accounts[${i}].ceiling`);
    });
    config.spendingModes?.forEach((mode, i) => {
      mode.liquidityTarget = convert(
        mode.liquidityTarget,
        `spendingModes[${i}].liquidityTarget`,
      );
      for (const key of ["activationTriggers", "deactivationTriggers"] as const)
        mode[key].rules.forEach((rule, j) => {
          if (
            [
              "unexpectedIncome",
              "bonusReceived",
              "refundReceived",
              "incomeReceived",
              "checkingBalance",
              "savingsBalance",
              "availableLiquidity",
              "netWorth",
              "investmentBalance",
              "categorySpending",
              "unexpectedExpense",
            ].includes(rule.metric)
          )
            rule.value = convert(
              rule.value,
              `spendingModes[${i}].${key}.rules[${j}].value`,
            );
        });
    });
    config.incomes.forEach((income, i) => {
      income.amount = convert(income.amount, `incomes[${i}].amount`);
    });
    config.paymentCards?.forEach((card, i) => {
      card.authorizedOverdraft = convert(
        card.authorizedOverdraft,
        `paymentCards[${i}].authorizedOverdraft`,
      );
      card.repaymentAmount = convert(
        card.repaymentAmount,
        `paymentCards[${i}].repaymentAmount`,
      );
    });
    config.charges.forEach((charge, i) => {
      charge.amount = convert(charge.amount, `charges[${i}].amount`);
    });
    config.creditFacilities?.forEach((loan, i) => {
      loan.amount = convert(loan.amount, `creditFacilities[${i}].amount`);
    });
    config.accountTransfers?.forEach((t, i) => {
      t.amount = convert(t.amount, `accountTransfers[${i}].amount`);
      if (t.minimumSourceBalance !== undefined)
        t.minimumSourceBalance = convert(
          t.minimumSourceBalance,
          `accountTransfers[${i}].minimumSourceBalance`,
        );
      if (!t.trigger.kind.endsWith("above-average"))
        t.trigger.threshold = convert(
          t.trigger.threshold,
          `accountTransfers[${i}].trigger.threshold`,
        );
    });
    for (const key of [
      "consumerInsurance",
      "cardInsurance",
      "consumerLimit",
      "cardLimit",
    ] as const)
      config.financing[key] = convert(
        config.financing[key],
        `financing.${key}`,
      );
    for (const [key, value] of Object.entries(config.budgets))
      config.budgets[key] = convert(value, `budgets.${key}`);
    for (const [key, value] of Object.entries(config.budgetOverrides ?? {}))
      config.budgetOverrides![key] = convert(value, `budgetOverrides.${key}`);
    config.plannedEvents.forEach((event, i) => {
      if (!event.type.startsWith("travel-"))
        event.amount = convert(event.amount, `plannedEvents[${i}].amount`);
      for (const key of [
        "monthlyImpact",
        "mortgagePrincipal",
        "mortgageInsurance",
        "extraCosts",
      ] as const)
        event[key] = convert(event[key], `plannedEvents[${i}].${key}`);
      for (const key of [
        "salary",
        "rent",
        "childMonthlyCost",
        "birthCost",
      ] as const)
        event.change[key] = convert(
          event.change[key],
          `plannedEvents[${i}].change.${key}`,
        );
    });
    assumptions.conversion = {
      from: fromCurrency,
      to: target.currency,
      rate,
      convention: "target-per-source",
    };
  }
  config.plannedEvents.forEach((event, i) => {
    if (!event.type.startsWith("travel-")) return;
    const destination = destinations.find((d) => d.id === event.destination);
    if (!destination) {
      preview.issues.push({
        path: `configuration.plannedEvents[${i}].destination`,
        message:
          "Resolve this trip destination before applying the new country.",
      });
      return;
    }
    const originalCurrency =
      event.type === "travel-domestic" ? fromCurrency : destination.currency;
    if (
      event.type === "travel-domestic" &&
      originalCurrency !== destination.currency
    ) {
      preview.issues.push({
        path: `configuration.plannedEvents[${i}]`,
        message:
          "This domestic trip needs a destination-currency budget before conversion.",
      });
      return;
    }
    event.type =
      destinationCountries[event.destination] === target.countryCode
        ? "travel-domestic"
        : "travel-abroad";
    if (destination.currency === target.currency) {
      event.exchangeRate = 1;
      event.fxFeePercent = 0;
    } else if (changedCurrency) event.exchangeRate /= rate;
  });
  if (changedCountry) {
    assumptions.bankingCountry = null;
    assumptions.consumptionCountry = null;
    assumptions.seasonalityCountry = null;
    delete assumptions.consumption;
    delete assumptions.seasonality;
    delete assumptions.banking;
    assumptions.sources = [
      ...target.sources,
      {
        title: "Scenario assumption",
        note: "Account rates, limits, final monthly envelopes and behavioral preferences are explicit user assumptions. No national banking or French consumer calibration is applied.",
      },
    ];
    config.seasonality.enabled = false;
    const effective =
      options.budgetAmounts ??
      monthlyEnvelopes(
        scenario.configuration,
        scenario.reference,
        scenario.assumptions,
      );
    config.budgetOverrides = Object.fromEntries(
      Object.entries(effective).map(([key, value]) => [
        key,
        Math.round(value * rate * scale) / scale,
      ]),
    );
    preview.notices.push(
      "Scenario assumptions: final envelopes are explicit amounts, seasonality is flat and bank rates, fees and caps require user review.",
    );
  }
  if (changedCurrency)
    assumptions.sources.push({
      title: "Currency conversion assumption",
      note: `${rate} ${target.currency} per 1 ${fromCurrency}; applied once to settlement amounts. Foreign-trip original budgets are preserved.`,
    });
  const sameReference =
    scenario.reference.id === target.id &&
    scenario.reference.version === target.version &&
    scenario.reference.countryCode === target.countryCode &&
    !changedCurrency;
  config.merchantOverrides = Object.fromEntries(
    Object.entries(config.merchantOverrides ?? {}).filter(([key]) => {
      const merchant = Number(key.split("|")[2]);
      return (
        sameReference &&
        target.merchants.some(
          (m) =>
            m.id === merchant &&
            scenario.reference.merchants.some(
              (old) =>
                old.id === merchant &&
                old.name === m.name &&
                old.category === m.category,
            ),
        )
      );
    }),
  );
  const removed =
    Object.keys(scenario.configuration.merchantOverrides ?? {}).length -
    Object.keys(config.merchantOverrides).length;
  if (removed)
    preview.notices.push(
      `${removed} merchant override(s) do not match the target reference and will be removed.`,
    );
  config.countryCode = target.countryCode;
  config.currency = target.currency;
  config.currencyDigits = target.currencyDigits;
  config.locale = target.locale;
  config.timeZone = target.timeZone;
  config.referenceId = target.id;
  config.region =
    options.region ??
    (target.regions.some((r) => r.id === config.region) ? config.region : "*");
  if (target.settings) {
    Object.assign(config, structuredClone(target.settings));
    if (options.region) config.region = options.region;
    preview.notices.push(
      "The file's budget and merchant settings will replace the reference settings for its saved profile.",
    );
    for (const [key, after] of Object.entries(
      target.settings.budgetOverrides ?? target.settings.budgets,
    )) {
      const before =
        options.budgetAmounts?.[key] ??
        scenario.configuration.budgetOverrides?.[key] ??
        scenario.configuration.budgets[key] ??
        0;
      if (before !== after)
        preview.changes.push({ path: `Budget: ${key}`, before, after });
    }
    delete target.settings;
  }
  const unmatchedPreferences = config.preferredMerchants.filter(
    (name) =>
      !target.merchants.some(
        (m) => m.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      ),
  );
  if (unmatchedPreferences.length)
    preview.notices.push(
      `Preferred merchant names retained as text; ${unmatchedPreferences.length} have no target-catalog match.`,
    );
  for (const [category, budget] of Object.entries({
    ...config.budgets,
    ...config.budgetOverrides,
  })) {
    if (
      budget <= 0 ||
      (category === "fuel" && !config.car) ||
      (category === "childrenActivities" && config.children === 0)
    )
      continue;
    const eligible = target.merchants.some(
      (m) =>
        m.category === category &&
        !m.travelOnly &&
        (!m.urbanOnly || config.urbanity !== "rural") &&
        (config.region === "*" ||
          config.region === "all" ||
          m.regions.includes("*") ||
          m.regions.includes(config.region ?? "all")),
    );
    if (eligible) continue;
    const decision = options.missingCategories?.[category];
    if (!decision) {
      preview.issues.push({
        path: `configuration.budgetOverrides.${category}`,
        message: `No eligible ${category} merchant. Set the envelope to zero, add a merchant, or mark it inactive.`,
      });
      continue;
    }
    config.budgetOverrides ??= {};
    config.budgetOverrides[category] = 0;
    if (decision === "zero") config.budgets[category] = 0;
    else {
      const reason = "No eligible merchant in the applied local reference.";
      preview.inactiveCategories.push({ category, reason });
      assumptions.sources.push({
        title: `Inactive category: ${category}`,
        note: `${reason} Original budget retained; effective envelope explicitly set to zero.`,
      });
    }
  }
  preview.issues.push(...validateScenario(config, target, assumptions));
  return preview;
}

export function applyCountryConversion(
  preview: CountryConversionPreview,
): ConfigurationFile {
  if (preview.issues.length) throw new ConfigurationError(preview.issues);
  return exportConfiguration(
    preview.configuration,
    preview.reference,
    preview.assumptions,
    preview.modelId,
  );
}
