import { eventOccurrences } from "../engine/events";
import { addDays } from "../engine/calendar";
import { inflationFactor } from "../engine/inflation";
import categories from "../../specifications/reference/categories.json";
import { categoryById } from "../domain/categories";
import destinations from "../../specifications/reference/travel-destinations.json";
import products from "../../specifications/reference/savings-products.json";
import type {
  Assumptions,
  CountryMerchantReference,
  PersonaConfig,
  ValidationIssue,
} from "../domain/types";
import {
  assumptionsSchema,
  checkSchema,
  configurationSchema,
  merchantReferenceSchema,
} from "./schema";
import {
  countryCodes,
  currencyPrecision,
  destinationCountries,
  isValidTimeZone,
} from "./registry";

export class ConfigurationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(
      issues
        .map((issue) => `${issue.path || "File"}: ${issue.message}`)
        .join("\n"),
    );
    this.name = "ConfigurationError";
    this.issues = issues;
  }
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function parseJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    throw new ConfigurationError([
      { path: "file", message: "Files must not exceed 5 MiB." },
    ]);
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigurationError([
      { path: "file", message: "The file is not valid JSON." },
    ]);
  }
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
export function horizonEnd(
  config: Pick<PersonaConfig, "startDate" | "years">,
): string {
  const [year, month, day] = config.startDate.split("-").map(Number);
  const lastDay = new Date(
    Date.UTC(year + config.years, month, 0),
  ).getUTCDate();
  return `${year + config.years}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
const precise = (value: number, digits: number) =>
  Number.isSafeInteger(Math.round(value * 10 ** digits)) &&
  value === Math.round(value * 10 ** digits) / 10 ** digits;
function contextIssues(
  context: Pick<
    PersonaConfig,
    "countryCode" | "currency" | "currencyDigits" | "locale" | "timeZone"
  >,
  root: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ path: `${root}.${field}`, message });
  if (context.countryCode && !countryCodes.has(context.countryCode))
    add("countryCode", "Choose a recognized ISO country code.");
  const digits = currencyPrecision(context.currency);
  if (digits === undefined)
    add(
      "currency",
      "Choose a supported ISO currency (zero to three decimal places).",
    );
  else if (context.currencyDigits !== digits)
    add(
      "currencyDigits",
      `${context.currency} requires ${digits} decimal places.`,
    );
  if (!isValidTimeZone(context.timeZone))
    add("timeZone", "Choose a recognized IANA timezone.");
  try {
    new Intl.Locale(context.locale);
    if (!context.locale.includes("-")) throw new Error();
  } catch {
    add("locale", "Use a valid BCP 47 locale, such as en-GB.");
  }
  return issues;
}
function unique<T>(
  entries: T[],
  key: (entry: T) => string | number,
  path: string,
  issues: ValidationIssue[],
): void {
  const used = new Set<string | number>();
  entries.forEach((entry, i) => {
    const id = key(entry);
    if (used.has(id))
      issues.push({
        path: `${path}[${i}]`,
        message: `Duplicate identifier: ${id}.`,
      });
    used.add(id);
  });
}

export function validateMerchantReference(
  value: unknown,
  expectedCountry?: string,
): ValidationIssue[] {
  const issues = checkSchema(value, merchantReferenceSchema, "reference");
  if (issues.length) return issues;
  const reference = value as CountryMerchantReference;
  issues.push(...contextIssues(reference, "reference"));
  if (expectedCountry && reference.countryCode !== expectedCountry)
    issues.push({
      path: "reference.countryCode",
      message: `This file belongs to ${reference.countryCode}; select a ${expectedCountry} reference.`,
    });
  unique(reference.regions, (r) => r.id, "reference.regions", issues);
  unique(reference.merchants, (m) => m.id, "reference.merchants", issues);
  if (reference.taxSystem) {
    const system = reference.taxSystem;
    unique(
      system.rows,
      (row) => String(row.shares),
      "reference.taxSystem.rows",
      issues,
    );
    for (const [i, row] of system.rows.entries()) {
      if (
        row.limits.length !== system.rates.length ||
        row.limits.at(-1) !== null ||
        row.limits
          .slice(0, -1)
          .some(
            (limit, j) =>
              limit === null || limit <= (j ? row.limits[j - 1]! : 0),
          )
      )
        issues.push({
          path: `reference.taxSystem.rows[${i}].limits`,
          message:
            "Use one increasing upper limit per rate; the final band must be unlimited.",
        });
    }
  }
  const regions = new Set(reference.regions.map((r) => r.id));
  reference.merchants.forEach((merchant, i) => {
    if (!precise(merchant.mean, reference.currencyDigits))
      issues.push({
        path: `reference.merchants[${i}].mean`,
        message: `Use at most ${reference.currencyDigits} decimal places for ${reference.currency}.`,
      });
    for (const region of merchant.regions)
      if (region !== "*" && !regions.has(region))
        issues.push({
          path: `reference.merchants[${i}].regions`,
          message: `Unknown region: ${region}.`,
        });
  });
  const settings = reference.settings;
  if (settings) {
    if (
      settings.region &&
      !["*", "all"].includes(settings.region) &&
      !regions.has(settings.region)
    )
      issues.push({
        path: "reference.settings.region",
        message: "Choose a region in this reference.",
      });
    for (const [key, amount] of [
      ...Object.entries(settings.budgets),
      ...Object.entries(settings.budgetOverrides ?? {}),
    ])
      if (!precise(amount, reference.currencyDigits))
        issues.push({
          path: `reference.settings.budgets.${key}`,
          message: "Budget precision must match the reference currency.",
        });
    for (const [key, value] of Object.entries(
      settings.merchantOverrides ?? {},
    )) {
      const [id, profile, merchant, extra] = key.split("|");
      if (
        id !== reference.id ||
        !["student", "modest", "family", "comfort", "retired"].includes(
          profile,
        ) ||
        extra !== undefined ||
        !reference.merchants.some((m) => String(m.id) === merchant)
      )
        issues.push({
          path: `reference.settings.merchantOverrides.${key}`,
          message:
            "The override must match this reference, profile and merchant.",
        });
      if (
        value.mean !== undefined &&
        !precise(value.mean, reference.currencyDigits)
      )
        issues.push({
          path: `reference.settings.merchantOverrides.${key}.mean`,
          message:
            "Purchase amount precision must match the reference currency.",
        });
    }
  }
  return issues;
}

export function validateScenario(
  configuration: unknown,
  reference: unknown,
  assumptions?: unknown,
): ValidationIssue[] {
  const issues = [
    ...checkSchema(configuration, configurationSchema, "configuration"),
    ...validateMerchantReference(reference),
  ];
  if (assumptions !== undefined)
    issues.push(...checkSchema(assumptions, assumptionsSchema, "assumptions"));
  if (issues.length) return issues;
  const config = configuration as PersonaConfig,
    ref = reference as CountryMerchantReference,
    context = assumptions as Assumptions | undefined;
  const add = (path: string, message: string) =>
    issues.push({ path: `configuration.${path}`, message });
  issues.push(...contextIssues(config, "configuration"));
  if (
    config.displayCurrency &&
    !Intl.supportedValuesOf("currency").includes(config.displayCurrency)
  )
    add("displayCurrency", "Choose a supported currency label.");
  unique(
    config.spendingModes ?? [],
    (m) => m.id,
    "configuration.spendingModes",
    issues,
  );
  (config.spendingModes ?? []).forEach((mode, i) => {
    const path = `spendingModes[${i}]`;
    for (const key of ["startDate", "endDate"] as const)
      if (mode[key] && !isCalendarDate(mode[key]!))
        add(`${path}.${key}`, "Enter a real calendar date.");
    if (mode.endDate && mode.startDate && mode.endDate < mode.startDate)
      add(`${path}.endDate`, "End date must follow the start date.");
    if (mode.recurrence !== "none" && !mode.startDate)
      add(`${path}.startDate`, "A recurring mode needs a start date.");
    if (mode.recurrence !== "none" && !mode.endDate && !mode.duration)
      add(
        `${path}.duration`,
        "A recurring mode needs an end date or duration.",
      );
    if (
      Math.abs(
        mode.allocation.needs +
          mode.allocation.wants +
          mode.allocation.future -
          100,
      ) > 0.001
    )
      add(
        `${path}.allocation`,
        "Needs, wants and future targets must total 100%.",
      );
    for (const key of ["activationTriggers", "deactivationTriggers"] as const)
      mode[key].rules.forEach((r, j) => {
        const p = `${path}.${key}.rules[${j}]`;
        if (
          ["date", "dateRange"].includes(r.metric) &&
          (!r.date || !isCalendarDate(r.date))
        )
          add(`${p}.date`, "Enter a real trigger date.");
        if (
          r.metric === "dateRange" &&
          (!r.endDate || !isCalendarDate(r.endDate) || r.endDate < r.date!)
        )
          add(`${p}.endDate`, "Choose a valid end date after the start.");
        if (r.metric === "categorySpending" && !r.category)
          add(`${p}.category`, "Choose a category.");
        const max =
          r.metric === "dayOfMonth"
            ? 31
            : r.metric === "monthOfYear"
              ? 12
              : undefined;
        if (max && (!Number.isInteger(r.value) || r.value < 1 || r.value > max))
          add(`${p}.value`, `Use a whole number between 1 and ${max}.`);
      });
    for (const [key, rule] of Object.entries(mode.categoryRules))
      if (rule.substituteTo === key)
        add(
          `${path}.categoryRules.${key}.substituteTo`,
          "Choose a different substitute category.",
        );
  });
  unique(
    config.otherTaxes ?? [],
    (t) => t.id,
    "configuration.otherTaxes",
    issues,
  );
  if (config.referenceId !== ref.id)
    add(
      "referenceId",
      "The configuration must match its embedded merchant reference.",
    );
  if (config.children >= config.household)
    add("children", "Children must be fewer than the household size.");
  if (config.accounts.filter((a) => a.type === "checking").length !== 1)
    add("accounts", "Exactly one current account is required.");
  if (
    config.incomes.length &&
    config.incomes.filter((i) => i.main).length !== 1
  )
    add("incomes", "Exactly one income source must be marked as main.");
  unique(config.accounts, (a) => a.key, "configuration.accounts", issues);
  unique(
    config.paymentCards ?? [],
    (card) => card.id,
    "configuration.paymentCards",
    issues,
  );
  if (
    config.defaultPaymentCardId &&
    !(config.paymentCards ?? []).some(
      (card) => card.id === config.defaultPaymentCardId,
    )
  )
    add("defaultPaymentCardId", "Choose a configured payment card.");
  unique(config.charges, (c) => c.id, "configuration.charges", issues);
  unique(config.incomes, (i) => i.id, "configuration.incomes", issues);
  unique(
    config.plannedEvents,
    (e) => e.id,
    "configuration.plannedEvents",
    issues,
  );
  const money = (
    value: number | null | undefined,
    path: string,
    digits = config.currencyDigits,
  ) => {
    if (value !== undefined && value !== null && !precise(value, digits))
      add(path, `Use at most ${digits} decimal places.`);
  };
  config.otherTaxes?.forEach((t, i) =>
    money(t.amount, `otherTaxes[${i}].amount`),
  );
  config.paymentCards?.forEach((card, i) => {
    money(card.authorizedOverdraft, `paymentCards[${i}].authorizedOverdraft`);
    money(card.repaymentAmount, `paymentCards[${i}].repaymentAmount`);
    if (
      card.type === "credit" &&
      card.repaymentFrequency === "weekly" &&
      card.repaymentDay > 7
    )
      add(
        `paymentCards[${i}].repaymentDay`,
        "Choose a weekday from 1 (Monday) to 7 (Sunday).",
      );
  });
  unique(
    config.accountTransfers ?? [],
    (t) => t.id,
    "configuration.accountTransfers",
    issues,
  );
  config.accountTransfers?.forEach((t, i) => {
    const p = `accountTransfers[${i}]`;
    money(t.amount, `${p}.amount`);
    money(t.minimumSourceBalance, `${p}.minimumSourceBalance`);
    for (const key of ["fromAccount", "toAccount"] as const)
      if (!config.accounts.some((a) => a.key === t[key]))
        add(`${p}.${key}`, "Choose an existing persona account.");
    if (t.fromAccount === t.toAccount)
      add(`${p}.toAccount`, "Choose a different receiving account.");
    for (const key of ["startDate", "endDate"] as const)
      if (
        t[key] !== undefined &&
        (!isCalendarDate(t[key]!) ||
          t[key]! < "1900-01-01" ||
          t[key]! > "2110-12-31")
      )
        add(
          `${p}.${key}`,
          "Choose a real date between 1900-01-01 and 2110-12-31.",
        );
    if (t.endDate && t.endDate < t.startDate)
      add(`${p}.endDate`, "End date must follow the start date.");
    if (t.timing === "triggered") {
      if (
        t.trigger.kind !== "income-above-average" &&
        !config.accounts.some((a) => a.key === t.trigger.account)
      )
        add(`${p}.trigger.account`, "Choose an existing account to monitor.");
      if (t.trigger.kind.endsWith("above-average")) {
        if (t.trigger.threshold < 0 || t.trigger.threshold > 1000)
          add(`${p}.trigger.threshold`, "Use a percentage between 0 and 1000.");
      } else money(t.trigger.threshold, `${p}.trigger.threshold`);
    }
  });
  config.accounts.forEach((account, i) => {
    if (account.key.startsWith("card:"))
      add(
        `accounts[${i}].key`,
        "The card: prefix is reserved for generated card accounts.",
      );
    money(account.openingBalance, `accounts[${i}].openingBalance`);
    money(account.ceiling, `accounts[${i}].ceiling`);
    if (account.type !== "checking" && account.openingBalance < 0)
      add(
        `accounts[${i}].openingBalance`,
        "Savings and investment opening balances cannot be negative.",
      );
    if (Math.abs(account.openingBalance) > 100000000)
      add(
        `accounts[${i}].openingBalance`,
        "Opening balances cannot exceed 100 million.",
      );
    const product = [...products, ...(context?.banking?.products ?? [])].find(
      (p) => p.id === account.product,
    );
    if (account.product && !product && account.product !== "custom")
      add(
        `accounts[${i}].product`,
        "Choose a registered product or an explicit custom product.",
      );
    if (product && product.type !== account.type)
      add(
        `accounts[${i}].product`,
        "This product is incompatible with the account type.",
      );
  });
  const categoryIds = new Set(categories.map((c) => c.id));
  config.charges.forEach((charge, i) => {
    money(charge.amount, `charges[${i}].amount`);
    if (
      !categoryIds.has(charge.categoryId) ||
      categoryById[charge.categoryId]?.parentId === 2
    )
      add(`charges[${i}].categoryId`, "Choose a known transaction category.");
  });
  unique(
    config.creditFacilities ?? [],
    (loan) => loan.id,
    "configuration.creditFacilities",
    issues,
  );
  (config.creditFacilities ?? []).forEach((loan, i) => {
    money(loan.amount, `creditFacilities[${i}].amount`);
    if (
      !isCalendarDate(loan.startDate) ||
      loan.startDate < "1900-01-01" ||
      loan.startDate > "2090-12-31"
    )
      add(
        `creditFacilities[${i}].startDate`,
        "Choose a real date between 1900-01-01 and 2090-12-31.",
      );
    if (loan.replaceHousingCharge && loan.type !== "mortgage")
      add(
        `creditFacilities[${i}].replaceHousingCharge`,
        "Only a mortgage can replace the housing charge.",
      );
  });
  config.incomes.forEach((income, i) => {
    money(income.amount, `incomes[${i}].amount`);
    for (const key of ["startDate", "endDate"] as const)
      if (income[key] && !isCalendarDate(income[key]!))
        add(`incomes[${i}].${key}`, "Enter a real calendar date.");
    if (income.startDate && income.endDate && income.endDate < income.startDate)
      add(`incomes[${i}].endDate`, "End date must follow start date.");
    if (["weekly", "fortnightly"].includes(income.frequency) && income.day > 7)
      add(
        `incomes[${i}].day`,
        "Weekly and fortnightly payment days must be between 1 and 7.",
      );
  });
  for (const key of [
    "buffer",
    "overdraftLimit",
    "topupThreshold",
    "topupAmount",
  ] as const)
    money(config[key], key);
  for (const [key, value] of Object.entries(config.budgets))
    money(value, `budgets.${key}`);
  for (const [key, value] of Object.entries(config.budgetOverrides ?? {}))
    money(value, `budgetOverrides.${key}`);
  for (const key of [
    "consumerInsurance",
    "cardInsurance",
    "consumerLimit",
    "cardLimit",
  ] as const)
    money(config.financing[key], `financing.${key}`);
  for (const [key, value] of Object.entries(config.merchantOverrides ?? {})) {
    const parts = key.split("|");
    if (
      parts.length !== 3 ||
      parts[0] !== ref.id ||
      !["student", "modest", "family", "comfort", "retired"].includes(
        parts[1],
      ) ||
      !ref.merchants.some((m) => String(m.id) === parts[2])
    )
      add(
        `merchantOverrides.${key}`,
        "Merchant overrides must identify this reference, a supported profile and an existing merchant.",
      );
    money(value.mean, `merchantOverrides.${key}.mean`);
  }
  const validOrigin =
    isCalendarDate(config.startDate) &&
    config.startDate >= "1900-01-01" &&
    config.startDate <= "2090-12-31";
  if (!validOrigin)
    add("startDate", "Choose a real date between 1900-01-01 and 2090-12-31.");
  const end = validOrigin ? horizonEnd(config) : "";
  if (config.inflation) {
    for (const id of Object.keys(config.inflation.chargeOverrides ?? {}))
      if (!config.charges.some((charge) => charge.id === id))
        add(`inflation.chargeOverrides.${id}`, "Choose an existing charge.");
    if (validOrigin) {
      // Include a margin for calibration, household changes, and cumulative postings.
      const exposure =
        Math.max(
          1,
          ...config.charges.map((c) => c.amount),
          ...Object.values({ ...config.budgets, ...config.budgetOverrides }),
          ...ref.merchants.map((m) => m.mean),
          ...config.plannedEvents.map((e) =>
            Math.max(e.monthlyImpact, e.change.rent, e.change.childMonthlyCost),
          ),
        ) *
        (config.costOfLiving ?? 1) *
        100 *
        config.years *
        12 *
        10 ** config.currencyDigits;
      const settings = [
        ["inflation", config.inflation] as const,
        ...Object.entries(config.inflation.chargeOverrides ?? {}).map(
          ([key, value]) =>
            [`inflation.chargeOverrides.${key}`, value] as const,
        ),
        ...Object.entries(config.inflation.budgetOverrides ?? {}).map(
          ([key, value]) =>
            [`inflation.budgetOverrides.${key}`, value] as const,
        ),
      ];
      for (const [path, value] of settings)
        if (
          value.rate > 0 &&
          inflationFactor(value, addDays(end, -1), config.startDate) *
            exposure >
            Number.MAX_SAFE_INTEGER
        )
          add(
            `${path}.rate`,
            "Inflation exceeds supported monetary precision over this horizon. Reduce the rate or duration.",
          );
    }
  }
  config.plannedEvents.forEach((event, i) => {
    const root = `plannedEvents[${i}]`;
    if (!isCalendarDate(event.startDate)) {
      add(`${root}.startDate`, "Choose a real calendar date.");
      return;
    }
    if (
      event.enabled &&
      validOrigin &&
      (event.startDate < config.startDate || event.startDate >= end)
    )
      add(
        `${root}.startDate`,
        "Enabled events must start within the simulation horizon.",
      );
    for (const key of [
      "monthlyImpact",
      "mortgagePrincipal",
      "mortgageInsurance",
      "extraCosts",
    ] as const)
      money(event[key], `${root}.${key}`);
    for (const key of [
      "salary",
      "rent",
      "childMonthlyCost",
      "birthCost",
    ] as const)
      money(event.change[key], `${root}.change.${key}`);
    const destination = destinations.find((d) => d.id === event.destination);
    money(
      event.amount,
      `${root}.amount`,
      event.type === "travel-abroad"
        ? (destination?.digits ?? config.currencyDigits)
        : config.currencyDigits,
    );
    if (!event.enabled) return;
    if (event.type.startsWith("travel-")) {
      if (!destination)
        add(`${root}.destination`, "Choose a supported trip destination.");
      else {
        const domestic = destination.currency === config.currency;
        if ((event.type === "travel-domestic") !== domestic)
          add(
            `${root}.type`,
            "Trip type must match whether the destination uses the ledger settlement currency.",
          );
        if (
          destination.currency === config.currency &&
          (event.exchangeRate !== 1 || event.fxFeePercent !== 0)
        )
          add(
            `${root}.exchangeRate`,
            "Trips in the settlement currency require rate 1 and zero conversion fees.",
          );
      }
      if (event.durationDays > 90)
        add(`${root}.durationDays`, "Trips cannot exceed 90 days.");
      if (event.travelers > config.household)
        add(`${root}.travelers`, "Travelers cannot exceed the household size.");
      const last = new Date(`${event.startDate}T12:00:00Z`);
      last.setUTCDate(last.getUTCDate() + event.durationDays - 1);
      const tripEnd = last.toISOString().slice(0, 10);
      if (
        validOrigin &&
        tripEnd >= end &&
        (!event.recurrence || event.recurrence === "once")
      )
        add(
          `${root}.durationDays`,
          "The trip must finish within the simulation horizon.",
        );
    }
    if (
      event.type === "property" &&
      event.mortgageEnabled &&
      event.mortgagePrincipal > event.amount + event.extraCosts
    )
      add(
        `${root}.mortgagePrincipal`,
        "Mortgage principal cannot exceed the purchase price plus costs.",
      );
    if (event.type !== "durable-change") return;
    const change = event.change;
    if (
      change.kind === "salary" &&
      !config.incomes.some((income) => income.main)
    )
      add(
        `${root}.change.salary`,
        "Add a main income source before configuring a salary change.",
      );
    if (
      change.kind === "rent" &&
      !config.charges.some((c) => c.id === change.chargeId && c.enabled)
    )
      add(`${root}.change.chargeId`, "Choose an enabled recurring charge.");
    if (change.kind === "category-prices" && !change.categories.length)
      add(`${root}.change.categories`, "Choose at least one category.");
  });
  // Cross-event rules must cover generated occurrences, not just their first dates.
  const occurrences = validOrigin
    ? eventOccurrences(
        config.plannedEvents.map((event) =>
          isCalendarDate(event.startDate) &&
          event.startDate >= config.startDate &&
          event.startDate < end
            ? event
            : { ...event, enabled: false },
        ),
        end,
      )
    : [];
  let previousTrip: { end: string; index: number } | undefined;
  const changes = new Set<string>();
  const factors: Record<string, number> = {};
  let household = config.household;
  const occurrenceIssue = (path: string, message: string) => {
    if (
      !issues.some(
        (issue) =>
          issue.path === `configuration.${path}` && issue.message === message,
      )
    )
      add(path, message);
  };
  for (const event of occurrences) {
    const root = `plannedEvents[${event.sourceIndex}]`;
    if (event.type.startsWith("travel-")) {
      const tripEnd = addDays(event.startDate, event.durationDays - 1);
      if (previousTrip && event.startDate <= previousTrip.end)
        occurrenceIssue(
          root,
          `This trip overlaps event ${previousTrip.index + 1}, including repeated occurrences.`,
        );
      if (!previousTrip || tripEnd > previousTrip.end)
        previousTrip = { end: tripEnd, index: event.sourceIndex };
    }
    if (event.type !== "durable-change") continue;
    const change = event.change;
    if (change.kind === "salary" || change.kind === "rent") {
      const key = `${event.startDate}|${change.kind}|${change.kind === "rent" ? change.chargeId : ""}`;
      if (changes.has(key))
        occurrenceIssue(
          root,
          "Two changes of the same income or charge cannot begin on the same date.",
        );
      changes.add(key);
    }
    if (change.kind === "birth") {
      household += change.childrenAdded;
      if (household > 12)
        occurrenceIssue(
          `${root}.change.childrenAdded`,
          "Birth events cannot bring the household above 12.",
        );
    }
    if (change.kind === "category-prices") {
      for (const category of change.categories) {
        factors[category] =
          (factors[category] ?? 1) * (1 + change.priceChangePercent / 100);
        if (
          factors[category] < 0.001 - 1e-12 ||
          factors[category] > 100 + 1e-12
        )
          occurrenceIssue(
            root,
            `Cumulative ${category} price factors must remain between 0.001 and 100.`,
          );
      }
    }
  }
  if (context) {
    if (
      context.consumption?.version.startsWith("fr.") &&
      context.consumptionCountry !== "FR"
    )
      issues.push({
        path: "assumptions.consumption",
        message:
          "French consumption calibration must not be assigned to another country.",
      });
    if (context.conversion && context.conversion.to !== config.currency)
      issues.push({
        path: "assumptions.conversion.to",
        message:
          "Conversion provenance must end in the current settlement currency.",
      });
  }
  return issues.filter(
    (issue, index, array) =>
      array.findIndex(
        (other) => other.path === issue.path && other.message === issue.message,
      ) === index,
  );
}
