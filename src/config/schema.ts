import { triggerLabels } from "./modes";
import referenceSchema from "../../specifications/contracts/local-merchant-reference.schema.json";
import legacyCategories from "../../specifications/reference/legacy-categories.json";
import categories from "../../specifications/reference/categories.json";
import fieldOptions from "../../specifications/reference/field-options.json";
import habits from "../../specifications/reference/habit-types.json";
import type { ValidationIssue } from "../domain/types";

export type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  nullable?: boolean;
  integer?: boolean;
};
const string = (maxLength = 150, minLength = 1): Schema => ({
  type: "string",
  minLength,
  maxLength,
});
const number = (minimum = 0, maximum = 1e9): Schema => ({
  type: "number",
  minimum,
  maximum,
});
const integer = (minimum: number, maximum: number): Schema => ({
  type: "integer",
  minimum,
  maximum,
});
const boolean: Schema = { type: "boolean" };
const enumeration = (values: unknown[]): Schema => ({ enum: values });
const array = (items: Schema, maxItems: number, minItems = 0): Schema => ({
  type: "array",
  items,
  maxItems,
  minItems,
});
const object = (
  properties: Record<string, Schema>,
  optional: string[] = [],
): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  additionalProperties: false,
});
const dictionary = (keys: string[], value: Schema): Schema =>
  object(Object.fromEntries(keys.map((k) => [k, value])), keys);
const map = (value: Schema): Schema => ({
  type: "object",
  additionalProperties: value,
});
const categoryKeys = categories.map((item) => item.key);
const spendingKeys = categories.filter((c) => c.budgetable).map((c) => c.key);
const profiles = ["student", "modest", "family", "comfort", "retired"];
const segments = [
  "everyday",
  "discount",
  "premium",
  "luxury",
  "healthcare",
  "children",
  "student",
  "vtc",
];
const category = enumeration(categoryKeys);
const date = { ...string(10), pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const account = object(
  {
    key: string(),
    name: string(),
    bank: string(),
    type: enumeration(["checking", "savings", "investment"]),
    openingBalance: number(-1e9),
    product: string(),
    annualRate: number(0, 30),
    ceiling: { ...number(), nullable: true },
    withdrawalRank: integer(0, 20),
    depositRank: integer(0, 20),
    interestMode: enumeration(fieldOptions.interestMode),
  },
  [
    "product",
    "annualRate",
    "ceiling",
    "withdrawalRank",
    "depositRank",
    "interestMode",
  ],
);
const charge = object({
  id: string(),
  name: string(),
  amount: number(),
  day: integer(1, 31),
  categoryId: integer(1, 1e9),
  enabled: boolean,
});
const inflationRate = {
  rate: number(-50, 100),
  period: enumeration(["monthly", "yearly"]),
};
const income = object(
  {
    categoryId: enumeration(
      categories.filter((c) => c.parentId === 2).map((c) => c.id),
    ),
    kind: enumeration(["salary", "bonus", "refund", "other"]),
    expected: boolean,
    cadence: enumeration(["recurring", "exceptional"]),
    change: enumeration(["temporary", "persistent"]),
    startDate: date,
    endDate: date,
    id: string(),
    label: string(),
    amount: number(0, 1e6),
    frequency: enumeration([
      "once",
      "daily",
      "weekly",
      "fortnightly",
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
    ]),
    day: integer(1, 31),
    month: integer(1, 12),
    amountVariation: number(0, 100),
    frequencyVariation: number(0, 100),
    annualGrowth: number(-50, 100),
    main: boolean,
    enabled: boolean,
  },
  [
    "categoryId",
    "kind",
    "expected",
    "cadence",
    "change",
    "startDate",
    "endDate",
  ],
);
const change = object({
  kind: enumeration(["salary", "rent", "category-prices", "birth"]),
  salary: number(0, 1e6),
  chargeId: string(150, 0),
  rent: number(),
  categories: { ...array(category, categories.length), uniqueItems: true },
  priceChangePercent: number(-90, 500),
  childrenAdded: integer(1, 6),
  childMonthlyCost: number(),
  birthCost: number(),
});
const event = object(
  {
    recurrence: enumeration(["once", "monthly", "yearly"]),
    expected: boolean,
    mandatory: boolean,
    id: string(),
    enabled: boolean,
    type: enumeration([
      "travel-domestic",
      "travel-abroad",
      "inheritance",
      "income-gap",
      "exceptional",
      "property",
      "car",
      "durable-change",
    ]),
    label: string(),
    startDate: date,
    durationDays: integer(1, 3650),
    amount: number(),
    destination: string(),
    travelers: integer(1, 12),
    exchangeRate: { ...number(0, 1e9), exclusiveMinimum: 0 },
    fxFeePercent: number(0, 100),
    incomeRemainingPercent: number(0, 100),
    incomeScope: enumeration(["main", "all"]),
    category,
    monthlyImpact: number(),
    replaceHousingCharge: boolean,
    mortgageEnabled: boolean,
    mortgagePrincipal: number(),
    mortgageRate: number(0, 50),
    mortgageMonths: integer(1, 480),
    mortgageInsurance: number(),
    extraCosts: number(),
    change,
  },
  ["expected", "mandatory", "recurrence"],
);
const taxPayment = {
  enabled: boolean,
  frequency: enumeration(["monthly", "quarterly", "annual"]),
  day: integer(1, 31),
  month: integer(1, 12),
};
const taxSystem = object({
  rates: array(number(0, 100), 12, 1),
  rows: array(
    object({
      shares: number(0.5, 20),
      limits: array({ ...number(0, 1e12), nullable: true }, 12, 1),
    }),
    30,
    1,
  ),
});
const trigger = object(
  {
    metric: enumeration(Object.keys(triggerLabels)),
    operator: enumeration(["lt", "lte", "gt", "gte", "eq"]),
    value: number(-1e12, 1e12),
    category,
    date,
    endDate: date,
    incomeKind: enumeration(["any", "salary", "bonus", "refund", "other"]),
    incomeExpected: enumeration(["any", "expected", "unexpected"]),
    incomeCadence: enumeration(["any", "recurring", "exceptional"]),
    incomeChange: enumeration(["any", "temporary", "persistent"]),
  },
  [
    "category",
    "date",
    "endDate",
    "incomeKind",
    "incomeExpected",
    "incomeCadence",
    "incomeChange",
  ],
);
const triggerGroup = object({
  match: enumeration(["all", "any"]),
  rules: array(trigger, 20),
});
const spendingMode = object(
  {
    id: string(),
    label: string(),
    kind: enumeration(["survival", "yolo", "balanced", "investor", "planner"]),
    enabled: boolean,
    active: boolean,
    priority: integer(0, 100),
    intensity: number(0, 1),
    activationTriggers: triggerGroup,
    deactivationTriggers: triggerGroup,
    startDate: date,
    endDate: date,
    duration: integer(1, 7300),
    recurrence: enumeration(["none", "monthly", "yearly"]),
    cooldown: integer(0, 7300),
    transitionDuration: integer(0, 365),
    categoryRules: dictionary(
      spendingKeys,
      object(
        {
          amount: number(0, 5),
          frequency: number(0, 5),
          substituteTo: category,
          substitutionShare: number(0, 1),
        },
        ["substituteTo", "substitutionShare"],
      ),
    ),
    savingsRules: object({
      contributionMultiplier: number(0, 1),
      withdrawals: enumeration(["never", "essentials", "available"]),
      withdrawalLimitPercent: number(0, 100),
    }),
    investmentRules: object({
      contributionMultiplier: number(0, 1),
      withdrawAfterDays: { ...integer(1, 7300), nullable: true },
    }),
    debtRules: object({ allowOverdraft: boolean, allowBorrowing: boolean }),
    liquidityTarget: number(),
    randomness: number(0, 1),
    allocation: object({
      needs: number(0, 100),
      wants: number(0, 100),
      future: number(0, 100),
    }),
    preferCheapMerchants: boolean,
    planningDays: integer(0, 365),
  },
  ["startDate", "endDate", "duration"],
);
export const configurationSchema = object(
  {
    categorySystem: { const: "bridge" },
    accountTransfers: array(
      object(
        {
          id: string(),
          label: string(),
          enabled: boolean,
          fromAccount: string(),
          toAccount: string(),
          amount: { ...number(0, 1e8), exclusiveMinimum: 0 },
          minimumSourceBalance: number(0, 1e8),
          startDate: date,
          endDate: date,
          timing: enumeration(["scheduled", "triggered"]),
          recurrence: enumeration([
            "once",
            "weekly",
            "monthly",
            "quarterly",
            "yearly",
          ]),
          trigger: object({
            kind: enumeration([
              "balance-below",
              "balance-above",
              "income-above-average",
              "balance-above-average",
            ]),
            account: string(),
            threshold: number(-1e8, 1e8),
            cooldownDays: integer(1, 7300),
          }),
        },
        ["endDate", "minimumSourceBalance"],
      ),
      100,
    ),
    spendingModes: array(spendingMode, 30),
    paymentCards: array(
      object({
        id: string(),
        label: string(150),
        type: enumeration(["debit", "deferred-debit", "credit"]),
        authorizedOverdraft: number(0, 1e8),
        overdraftAnnualRate: number(0, 100),
        settlementDay: integer(1, 31),
        creditAnnualRate: number(0, 100),
        repaymentFrequency: enumeration([
          "weekly",
          "monthly",
          "quarterly",
          "annual",
        ]),
        repaymentDay: integer(1, 31),
        repaymentMonth: integer(1, 12),
        repaymentMode: enumeration(["amount", "percent"]),
        repaymentAmount: number(0, 1e8),
        repaymentPercent: number(0, 100),
      }),
      20,
      1,
    ),
    defaultPaymentCardId: string(),
    riskProfile: enumeration(["conservative", "balanced", "growth"]),
    locationDescription: string(250, 0),
    costOfLiving: number(0.1, 10),
    inflation: object(
      {
        ...inflationRate,
        chargeOverrides: map(object(inflationRate)),
        budgetOverrides: dictionary(spendingKeys, object(inflationRate)),
      },
      ["chargeOverrides", "budgetOverrides"],
    ),
    displayCurrency: string(3),
    incomeTax: object(taxPayment),
    otherTaxes: array(
      object(
        {
          id: string(),
          label: string(),
          categoryId: enumeration(
            categories.filter((c) => c.parentId === 159).map((c) => c.id),
          ),
          amount: number(),
          ...taxPayment,
        },
        ["categoryId"],
      ),
      50,
    ),
    id: string(120),
    name: string(80),
    seed: string(150),
    locale: string(),
    currency: string(3),
    age: integer(18, 100),
    household: integer(1, 12),
    children: integer(0, 11),
    employment: enumeration(fieldOptions.employment),
    // Import-only compatibility: current settings and exports omit this field.
    bankFees: object({
      enabled: boolean,
      authorizedRate: number(0, 50),
      minimumQuarterly: number(),
      unauthorizedRate: number(0, 50),
      commission: number(),
      monthlyCap: number(),
      protection: enumeration([...fieldOptions.bankFeeProtection, "custom"]),
    }),
    region: string(),
    urbanity: enumeration(fieldOptions.urbanity),
    housing: enumeration(fieldOptions.housing),
    car: boolean,
    family: enumeration(fieldOptions.family),
    autonomy: enumeration(fieldOptions.autonomy),
    style: enumeration(profiles),
    accounts: array(account, 20, 1),
    charges: array(charge, 100),
    discretionary: number(0, 3),
    savingAggression: number(0, 1),
    lowBalance: enumeration(fieldOptions.lowBalance),
    buffer: number(),
    overdraft: boolean,
    overdraftLimit: number(),
    autoSavings: boolean,
    autoTopup: boolean,
    topupThreshold: number(-1e9),
    topupAmount: number(),
    preferredMerchants: array(string(), 5000),
    budgets: dictionary(spendingKeys, number()),
    budgetOverrides: dictionary(spendingKeys, number()),
    events: dictionary(
      habits.map((h) => h.id),
      boolean,
    ),
    travelCities: array(string(), 100),
    startDate: date,
    years: integer(1, 20),
    seasonality: object({
      enabled: boolean,
      volumeStrength: number(0, 2),
      amountStrength: number(0, 2),
    }),
    financing: object({
      consumerEnabled: boolean,
      cardEnabled: boolean,
      priority: enumeration(fieldOptions.financingPriority),
      scope: enumeration(fieldOptions.financingScope),
      consumerInsurance: number(),
      cardInsurance: number(),
      consumerRate: number(0, 50),
      consumerMonths: integer(1, 120),
      consumerLimit: number(0, 1e6),
      cardRate: number(0, 50),
      cardMonths: integer(1, 60),
      cardLimit: number(0, 1e5),
    }),
    plannedEvents: array(event, 100),
    creditFacilities: array(
      object({
        id: string(),
        type: enumeration(["mortgage", "auto", "personal", "student", "card"]),
        label: string(150),
        enabled: boolean,
        startDate: date,
        amount: { ...number(0, 1e8), exclusiveMinimum: 0 },
        annualRate: number(0, 50),
        months: integer(1, 480),
        replaceHousingCharge: boolean,
      }),
      30,
    ),
    incomes: array(income, 30),
    countryCode: string(2),
    currencyDigits: integer(0, 3),
    timeZone: string(),
    referenceId: string(),
    merchantOverrides: map(
      object(
        {
          mean: { ...number(0, 100000), exclusiveMinimum: 0 },
          frequency: number(0, 1000),
        },
        ["mean", "frequency"],
      ),
    ),
  },
  [
    "categorySystem",
    "accountTransfers",
    "spendingModes",
    "paymentCards",
    "defaultPaymentCardId",
    "riskProfile",
    "bankFees",
    "merchantOverrides",
    "budgetOverrides",
    "creditFacilities",
    "locationDescription",
    "costOfLiving",
    "inflation",
    "displayCurrency",
    "incomeTax",
    "otherTaxes",
    "countryCode",
    "region",
    "urbanity",
    "family",
  ],
);

const source = object(
  {
    title: string(500),
    note: string(5000),
    url: { ...string(2000), pattern: "^https://" },
    id: string(),
    date: string(500),
    finding: string(10000),
    use: string(10000),
    summary: string(10000),
    assumption: string(10000),
    countryCode: string(2),
    type: string(),
  },
  [
    "note",
    "url",
    "id",
    "date",
    "finding",
    "use",
    "summary",
    "assumption",
    "countryCode",
    "type",
  ],
);
const series = [
  "all",
  "groceries",
  "shopping",
  "fuel",
  "hotels",
  "restaurants",
  "taxes",
  "bankfees",
  "incidentfees",
  "fastfood",
  "bars",
  "alcohol",
  "cycling",
  "culture",
];
const twelveNumbers = { ...array(number(), 12, 12) };
const consumption = object({
  version: string(),
  profiles: array(
    object({
      id: enumeration(profiles),
      name: string(),
      factor: number(0, 20),
      description: string(10000),
      budgets: dictionary(spendingKeys, number(0, 100)),
      basket: number(0, 100),
      basketOverrides: dictionary(spendingKeys, number(0, 100)),
      affinity: dictionary(segments, number(0, 100)),
    }),
    5,
  ),
  categoryBases: array(
    object({
      key: category,
      id: integer(1, 1e9),
      name: string(),
      protected: boolean,
      monthly: number(),
    }),
    categories.length,
  ),
  observedBudgetShares: dictionary(
    spendingKeys,
    object({
      modest: number(0, 100),
      comfort: number(0, 100),
      all: number(0, 100),
    }),
  ),
});
const seasonality = object({
  version: string(),
  combined: dictionary(
    series,
    object({
      months: { ...array(integer(1, 12), 12, 12), uniqueItems: true },
      weightedCounts: twelveNumbers,
      normalizedVolume: twelveNumbers,
    }),
  ),
  mapping: dictionary(
    spendingKeys,
    object({ series: enumeration(series), proxy: boolean }, ["proxy"]),
  ),
  source: object({
    version: string(),
    title: string(500),
    period: string(500),
    sample: map(integer(1, 1e9)),
    measure: string(5000),
    sourceMonths: array(string(), 12, 12),
    calendarMonths: array(string(), 12, 12),
  }),
});
const banking = object({
  products: array(
    object({
      id: string(),
      name: string(),
      type: enumeration(["checking", "savings", "investment"]),
      rate: number(0, 30),
      ceiling: { ...number(), nullable: true },
      note: string(5000),
    }),
    100,
  ),
  sources: array(source, 100),
  policy: string(1000),
});
export const assumptionsSchema = object(
  {
    bankingCountry: { ...string(2), nullable: true },
    consumptionCountry: { ...string(2), nullable: true },
    seasonalityCountry: { ...string(2), nullable: true },
    sources: array(source, 100),
    consumption,
    seasonality,
    banking,
    conversion: object({
      from: string(3),
      to: string(3),
      rate: { ...number(0, 1e9), exclusiveMinimum: 0 },
      convention: { const: "target-per-source" },
    }),
  },
  ["consumption", "seasonality", "banking", "conversion"],
);
export const merchantReferenceSchema: Schema = {
  ...referenceSchema,
  properties: {
    ...referenceSchema.properties,
    taxSystem,
    settings: object(
      Object.fromEntries(
        [
          "region",
          "costOfLiving",
          "style",
          "budgets",
          "budgetOverrides",
          "merchantOverrides",
        ].map((key) => [key, configurationSchema.properties![key]]),
      ),
      ["budgetOverrides", "merchantOverrides", "region", "costOfLiving"],
    ),
  },
};
export const fileSchema = object({
  format: { const: "personia.configuration" },
  version: { const: 2 },
  specificationVersion: { const: "2" },
  uiLocale: { const: "en-GB" },
  modelId: string(),
  configuration: configurationSchema,
  reference: merchantReferenceSchema,
  referenceHash: { ...string(64), pattern: "^[a-f0-9]{64}$" },
  assumptions: assumptionsSchema,
});

const unsafe = new Set(["__proto__", "prototype", "constructor"]);
/** Closed schemas reject unknown properties at every level before typed data reaches the engine. */
export function checkSchema(
  value: unknown,
  schema: Schema,
  path = "",
  draft = false,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (message: string) => {
    issues.push({ path, message });
  };
  if (value === null && schema.nullable) return issues;
  if ("const" in schema && value !== schema.const)
    issue(`Expected ${JSON.stringify(schema.const)}.`);
  if (schema.enum && !schema.enum.includes(value))
    issue(`Choose one of: ${schema.enum.join(", ")}.`);
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      issue("Expected an object.");
      return issues;
    }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(record, key))
        issues.push({
          path: path ? `${path}.${key}` : key,
          message: "This field is required.",
        });
    for (const [key, child] of Object.entries(record)) {
      const childPath = path ? `${path}.${key}` : key;
      if (unsafe.has(key)) {
        issues.push({
          path: childPath,
          message: "Unsafe identifier is not allowed.",
        });
        continue;
      }
      const childSchema =
        schema.properties && Object.hasOwn(schema.properties, key)
          ? schema.properties[key]
          : typeof schema.additionalProperties === "object"
            ? schema.additionalProperties
            : undefined;
      if (childSchema)
        issues.push(...checkSchema(child, childSchema, childPath, draft));
      else if (schema.additionalProperties === false)
        issues.push({
          path: childPath,
          message: "Unknown field is not allowed.",
        });
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      issue("Expected an array.");
      return issues;
    }
    if (
      !draft &&
      schema.minItems !== undefined &&
      value.length < schema.minItems
    )
      issue(`At least ${schema.minItems} entries are required.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      issue(`No more than ${schema.maxItems} entries are allowed.`);
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      issue("Entries must be unique.");
    if (schema.items)
      value
        .slice(0, (schema.maxItems ?? 5000) + 1)
        .forEach((child, i) =>
          issues.push(
            ...checkSchema(child, schema.items!, `${path}[${i}]`, draft),
          ),
        );
  } else if (schema.type === "string") {
    if (typeof value !== "string") {
      issue("Expected text.");
      return issues;
    }
    // Local drafts retain incomplete text; imports and generation remain strict.
    if (draft) return issues;
    if (
      schema.minLength !== undefined &&
      value.trim().length < schema.minLength
    )
      issue("This field must not be empty.");
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      issue(`Use no more than ${schema.maxLength} characters.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      issue("The text has an invalid format.");
    if (/<\/?[A-Za-z][^>]*>|(?:javascript|data):|\u0000/i.test(value))
      issue("Markup and executable content are not allowed.");
    if (
      unsafe.has(value) &&
      /(?:^|\.)(?:id|key|chargeId|referenceId)$/.test(path)
    )
      issue("Unsafe identifier is not allowed.");
  } else if (schema.type === "number" || schema.type === "integer") {
    if (draft && typeof value === "number") return issues;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issue("Enter a finite number.");
      return issues;
    }
    if (schema.type === "integer" && !Number.isSafeInteger(value))
      issue("Enter a whole number.");
    if (schema.minimum !== undefined && value < schema.minimum)
      issue(`Must be at least ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum)
      issue(`Must be no more than ${schema.maximum}.`);
    if (
      schema.exclusiveMinimum !== undefined &&
      value <= schema.exclusiveMinimum
    )
      issue(`Must be greater than ${schema.exclusiveMinimum}.`);
  } else if (schema.type === "boolean" && typeof value !== "boolean")
    issue("Expected true or false.");
  return issues;
}

/** Validate every legacy field before migration; arbitrary properties are still rejected. */
export function legacyCompatibleSchema(schema: Schema): Schema {
  const next = structuredClone(schema);
  const walk = (node: Schema): void => {
    if (
      node.enum &&
      node.enum.includes("groceries") &&
      node.enum.includes("restaurants")
    )
      node.enum = [
        ...new Set([...node.enum, ...legacyCategories.map((c) => c.key)]),
      ];
    if (
      node.enum &&
      node.enum.every((v) => typeof v === "number") &&
      node.enum.includes(273)
    )
      node.enum = [
        ...new Set([
          ...node.enum,
          ...legacyCategories.map((c) => c.id),
          859,
          54,
          328,
          800,
          212,
          9000,
          9002,
          9004,
        ]),
      ];
    if (node.properties) {
      if (spendingKeys.every((k) => Object.hasOwn(node.properties!, k)))
        for (const c of legacyCategories)
          node.properties[c.key] ??= structuredClone(
            node.properties[spendingKeys[0]],
          );
      Object.values(node.properties).forEach(walk);
    }
    if (node.items) walk(node.items);
    if (typeof node.additionalProperties === "object")
      walk(node.additionalProperties);
  };
  walk(next);
  return next;
}
