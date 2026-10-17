# Person’IA — Target data contracts

Specification revision 2. These contracts describe the target application. Validate unknown JSON before it enters the typed model. Scalar string fields are constrained by the enums and registries in the specification and reference schema.

## Persona configuration

~~~ts
interface PersonaConfig {
  paymentCards?: PaymentCard[];
  defaultPaymentCardId?: string;
  id: string;
  name: string;
  seed: string;
  locale: string;
  currency: string;
  age: number;
  household: number;
  children: number;
  employment: string;
  region: string;
  urbanity: string;
  housing: string;
  car: boolean;
  family: string;
  autonomy: string;
  style: string;
  accounts: Account[];
  charges: Charge[];
  discretionary: number;
  savingAggression: number;
  lowBalance: string;
  buffer: number;
  overdraft: boolean;
  overdraftLimit: number;
  autoSavings: boolean;
  autoTopup: boolean;
  topupThreshold: number;
  topupAmount: number;
  preferredMerchants: (string)[];
  budgets: Record<string, number>;
  events: Record<string, boolean>;
  travelCities: (string)[];
  startDate: string;
  years: number;
  seasonality: {
    "enabled": boolean;
    "volumeStrength": number;
    "amountStrength": number;
  };
  financing: {
    "consumerEnabled": boolean;
    "cardEnabled": boolean;
    "priority": string;
    "scope": string;
    "consumerInsurance": number;
    "cardInsurance": number;
    "consumerRate": number;
    "consumerMonths": number;
    "consumerLimit": number;
    "cardRate": number;
    "cardMonths": number;
    "cardLimit": number;
  };
  plannedEvents: PlannedEvent[];
  incomes: Income[];
  countryCode: string;
  currencyDigits: number;
  timeZone: string;
  referenceId: string;
  merchantOverrides?: Record<string, {mean?: number; frequency?: number}>;
}

interface Account { key: string; name: string; bank: string; type: "checking" | "savings" | "investment"; openingBalance: number; product?: string; annualRate?: number; ceiling?: number | null; withdrawalRank?: number; depositRank?: number; interestMode?: "fortnight" | "daily"; }

type Charge = {
  "id": string;
  "name": string;
  "amount": number;
  "day": number;
  "categoryId": number;
  "enabled": boolean;
};

type Income = {
  "id": string;
  "label": string;
  "amount": number;
  "frequency": string;
  "day": number;
  "month": number;
  "amountVariation": number;
  "frequencyVariation": number;
  "annualGrowth": number;
  "main": boolean;
  "enabled": boolean;
};

type PlannedEvent = {
  "id": string;
  "enabled": boolean;
  "type": string;
  "label": string;
  "startDate": string;
  "durationDays": number;
  "amount": number;
  "destination": string;
  "travelers": number;
  "exchangeRate": number;
  "fxFeePercent": number;
  "incomeRemainingPercent": number;
  "incomeScope": string;
  "category": string;
  "monthlyImpact": number;
  "replaceHousingCharge": boolean;
  "mortgageEnabled": boolean;
  "mortgagePrincipal": number;
  "mortgageRate": number;
  "mortgageMonths": number;
  "mortgageInsurance": number;
  "extraCosts": number;
  "change": {
    "kind": string;
    "salary": number;
    "chargeId": string;
    "rent": number;
    "categories": (string)[];
    "priceChangePercent": number;
    "childrenAdded": number;
    "childMonthlyCost": number;
    "birthCost": number;
  };
};
~~~

Legacy files may contain a bankFees object; it is accepted only for backwards compatibility, ignored by generation and removed from current configuration exports. The events type registry includes travel-domestic, travel-abroad, inheritance, income-gap, exceptional, property, car and durable-change.

The income frequency registry includes daily, weekly, fortnightly, monthly, quarterly, semiannual and annual. Every income array with entries has exactly one main source.

Country context uses countryCode, locale, currency, currencyDigits, timeZone and referenceId. Interface locale is separate and is en-GB. Monetary values use settlement-currency major units and exact supported minor-unit precision.

## Payment cards

```ts
interface PaymentCard {
  id: string;
  label: string;
  type: 'debit' | 'deferred-debit' | 'credit';
  authorizedOverdraft: number; // current-account allowance, default 0
  overdraftAnnualRate: number; // percent, default 0
  settlementDay: number; // 1–31, default 1
  creditAnnualRate: number; // percent, default 20
  repaymentFrequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  repaymentDay: number; // 1–7 for weekly; otherwise 1–31
  repaymentMonth: number; // quarter/year anchor, 1–12
  repaymentMode: 'amount' | 'percent';
  repaymentAmount: number; // default 100, capped at outstanding balance
  repaymentPercent: number; // default 10
}
```

All card settings persist when changing type. Missing paymentCards initializes a default debit card. A configured list has one to twenty unique IDs; defaultPaymentCardId must resolve. Card ledgers open at zero and use reserved `card:<id>` keys, with `deferred-card` or `credit-card` account type. Transaction parsedData includes paymentCardId. Refunds are equal transfer legs; purchases and monthly interest count as expenses. Rates are percentages; overdraft/refund amounts use the persona currency's minor-unit precision.

## Configuration envelope

~~~ts
interface ConfigurationFile {
  format: 'personia.configuration';
  version: 2;
  specificationVersion: '2';
  uiLocale: 'en-GB';
  modelId: string;
  configuration: PersonaConfig;
  reference: CountryMerchantReference;
  referenceHash: string;
  assumptions: {
    bankingCountry: string | null;
    consumptionCountry: string | null;
    seasonalityCountry: string | null;
    sources: SourceRecord[];
    consumption?: ConsumptionAssumptions;
    seasonality?: SeasonalAssumptions;
    banking?: BankingAssumptions;
    conversion?: {
      from: string;
      to: string;
      rate: number;
      convention: 'target-per-source';
    };
  };
}
~~~

CountryMerchantReference is defined by [local-merchant-reference.schema.json](local-merchant-reference.schema.json). SourceRecord and assumption structures are versioned provenance/calibration records, exemplified in the complete French configurations. Validate their registry shapes; they do not accept executable expressions.

The embedded consumption block contains version, profiles, categoryBases and observedBudgetShares. The seasonal block contains version, combined, mapping and source. The banking block contains products, sources and policy. Required source keys and values are illustrated in the source registry JSON.

## Local reference

Use the complete JSON Schema for required fields and bounds. Also verify recognized country/currency/timezone metadata, unique merchant and region IDs, canonical category keys, declared region references and currency precision.

The reference hash uses UTF-8 JSON with object keys sorted recursively, array order preserved and no insignificant whitespace. Use consistent JSON number serialization across implementations. The supplied examples avoid ambiguous numerical representations.

## Financial behavior

Exactly one current account is required. Positive withdrawal/deposit ranks control savings access independently. Merchant override keys include reference ID, profile ID and merchant ID. A local reference supplies country/currency context and optional per-profile purchase frequencies.

Currency setup converts settlement-denominated monetary values once with a fixed target-per-source rate, retains percentages/frequencies and records provenance. Foreign-trip source amounts are retained and conversion quotes rebased. Apply country and reference only after resolving incompatible regions/events/overrides.

A financial fingerprint excludes uiLocale and display-only strings. It includes numeric financial inputs, country/currency/timezone, active reference content and engine version.

## Statements

History follows data/meta/included. Transaction records include signed settlement amounts, IDs, operation/accounting dates, category IDs, balanceAfter and optional income/event/loan/FX links. Metadata records country, currency, reference/version/hash and engine version. Component amounts reconcile in integer minor units. Outside-window loan schedule rows do not create out-of-window postings.

Target samples describe the developer contract; runtime import and UI tests must be completed when implementing it.
