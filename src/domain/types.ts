/** Shared interchange contracts. Engine internals and UI never own competing copies. */
export interface Account {
  key: string;
  name: string;
  bank: string;
  type: "checking" | "savings" | "investment";
  openingBalance: number;
  product?: string;
  annualRate?: number;
  ceiling?: number | null;
  withdrawalRank?: number;
  depositRank?: number;
  interestMode?: "fortnight" | "daily";
}
export type PaymentCardType = "debit" | "deferred-debit" | "credit";
export interface PaymentCard {
  id: string;
  label: string;
  type: PaymentCardType;
  authorizedOverdraft: number;
  overdraftAnnualRate: number;
  settlementDay: number;
  creditAnnualRate: number;
  repaymentFrequency: "weekly" | "monthly" | "quarterly" | "annual";
  repaymentDay: number;
  repaymentMonth: number;
  repaymentMode: "amount" | "percent";
  repaymentAmount: number;
  repaymentPercent: number;
}
export interface PaymentCardAccount extends Omit<Account, "type"> {
  type: "deferred-card" | "credit-card";
  paymentCardId: string;
}
export type LedgerAccount = Account | PaymentCardAccount;
export interface InflationRate {
  rate: number;
  period: "monthly" | "yearly";
}
export interface InflationSettings extends InflationRate {
  chargeOverrides?: Record<string, InflationRate>;
  budgetOverrides?: Record<string, InflationRate>;
}
export interface Charge {
  id: string;
  name: string;
  amount: number;
  day: number;
  categoryId: number;
  enabled: boolean;
}
export interface AccountTransfer {
  id: string;
  label: string;
  enabled: boolean;
  fromAccount: string;
  toAccount: string;
  amount: number;
  /** Optional pre-transfer balance floor for scheduled instructions. Funds must always cover the amount. */
  minimumSourceBalance?: number;
  startDate: string;
  endDate?: string;
  timing: "scheduled" | "triggered";
  recurrence: "once" | "weekly" | "monthly" | "quarterly" | "yearly";
  trigger: {
    kind:
      | "balance-below"
      | "balance-above"
      | "income-above-average"
      | "balance-above-average";
    account: string;
    threshold: number;
    cooldownDays: number;
  };
}
export interface Income {
  kind?: "salary" | "bonus" | "refund" | "other";
  expected?: boolean;
  cadence?: "recurring" | "exceptional";
  change?: "temporary" | "persistent";
  startDate?: string;
  endDate?: string;
  id: string;
  label: string;
  amount: number;
  frequency: string;
  day: number;
  month: number;
  amountVariation: number;
  frequencyVariation: number;
  annualGrowth: number;
  main: boolean;
  enabled: boolean;
}
export interface PlannedEvent {
  recurrence?: "once" | "monthly" | "yearly";
  expected?: boolean;
  mandatory?: boolean;
  id: string;
  enabled: boolean;
  type: string;
  label: string;
  startDate: string;
  durationDays: number;
  amount: number;
  destination: string;
  travelers: number;
  exchangeRate: number;
  fxFeePercent: number;
  incomeRemainingPercent: number;
  incomeScope: string;
  category: string;
  monthlyImpact: number;
  replaceHousingCharge: boolean;
  mortgageEnabled: boolean;
  mortgagePrincipal: number;
  mortgageRate: number;
  mortgageMonths: number;
  mortgageInsurance: number;
  extraCosts: number;
  change: {
    kind: string;
    salary: number;
    chargeId: string;
    rent: number;
    categories: string[];
    priceChangePercent: number;
    childrenAdded: number;
    childMonthlyCost: number;
    birthCost: number;
  };
}
export interface CreditFacility {
  id: string;
  type: "mortgage" | "auto" | "personal" | "student" | "card";
  label: string;
  enabled: boolean;
  startDate: string;
  amount: number;
  annualRate: number;
  months: number;
  replaceHousingCharge: boolean;
}
export type TaxFrequency = "monthly" | "quarterly" | "annual";
export interface TaxSystem {
  rates: number[];
  rows: { shares: number; limits: (number | null)[] }[];
}
export interface TaxPayment {
  enabled: boolean;
  frequency: TaxFrequency;
  day: number;
  month: number;
}
export interface OtherTax extends TaxPayment {
  id: string;
  label: string;
  amount: number;
}
export interface PersonaConfig {
  paymentCards?: PaymentCard[];
  defaultPaymentCardId?: string;
  accountTransfers?: AccountTransfer[];
  spendingModes?: import("./modes").SpendingMode[];
  /** Legacy import only. Ignored by generation and removed from exports. */
  riskProfile?: "conservative" | "balanced" | "growth";
  locationDescription?: string;
  costOfLiving?: number;
  inflation?: InflationSettings;
  displayCurrency?: string;
  incomeTax?: TaxPayment;
  otherTaxes?: OtherTax[];

  creditFacilities?: CreditFacility[];
  id: string;
  name: string;
  seed: string;
  locale: string;
  currency: string;
  age: number;
  household: number;
  children: number;
  employment: string;
  /** Legacy import only. Ignored by generation and removed from exports. */
  bankFees?: {
    enabled: boolean;
    authorizedRate: number;
    minimumQuarterly: number;
    unauthorizedRate: number;
    commission: number;
    monthlyCap: number;
    protection: string;
  };
  region?: string;
  urbanity?: string;
  housing: string;
  car: boolean;
  family?: string;
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
  preferredMerchants: string[];
  budgets: Record<string, number>;
  budgetOverrides?: Record<string, number>;
  events: Record<string, boolean>;
  travelCities: string[];
  startDate: string;
  years: number;
  seasonality: {
    enabled: boolean;
    volumeStrength: number;
    amountStrength: number;
  };
  financing: {
    consumerEnabled: boolean;
    cardEnabled: boolean;
    priority: string;
    scope: string;
    consumerInsurance: number;
    cardInsurance: number;
    consumerRate: number;
    consumerMonths: number;
    consumerLimit: number;
    cardRate: number;
    cardMonths: number;
    cardLimit: number;
  };
  plannedEvents: PlannedEvent[];
  incomes: Income[];
  countryCode?: string;
  currencyDigits: number;
  timeZone: string;
  referenceId: string;
  merchantOverrides?: Record<string, { mean?: number; frequency?: number }>;
}
export interface Merchant {
  id: number;
  name: string;
  category: string;
  mean: number;
  regions: string[];
  segment?: string;
  urbanOnly?: boolean;
  travelOnly?: boolean;
  scenario?: boolean;
  monthlyFrequencyByProfile?: Record<string, number>;
}
export interface SourceRecord {
  title: string;
  url?: string;
  note?: string;
  id?: string;
  summary?: string;
  finding?: string;
  assumption?: string;
  countryCode?: string;
  type?: string;
  [key: string]: unknown;
}
export interface CountryMerchantReference {
  format: "personia.merchant-reference";
  version: 1;
  id: string;
  name: string;
  countryCode: string;
  currency: string;
  currencyDigits: number;
  locale: string;
  timeZone: string;
  dataStatus: "scenario-assumptions" | "documented-estimates";
  regions: { id: string; name: string; factor: number; city?: string }[];
  merchants: Merchant[];
  sources: SourceRecord[];
  /** Optional editor snapshot; catalog-only references remain supported. */
  taxSystem?: TaxSystem;
  settings?: Pick<
    PersonaConfig,
    | "region"
    | "style"
    | "budgets"
    | "budgetOverrides"
    | "merchantOverrides"
    | "costOfLiving"
  >;
}
// Embedded calibrations share the supplied, versioned registry shape.
type FrenchAssumptions =
  (typeof import("../../specifications/configurations/nicolas.personia.json"))["assumptions"];
export interface Assumptions {
  bankingCountry: string | null;
  consumptionCountry: string | null;
  seasonalityCountry: string | null;
  sources: SourceRecord[];
  consumption?: FrenchAssumptions["consumption"];
  seasonality?: FrenchAssumptions["seasonality"];
  banking?: FrenchAssumptions["banking"];
  conversion?: {
    from: string;
    to: string;
    rate: number;
    convention: "target-per-source";
  };
}
export interface ConfigurationFile {
  format: "personia.configuration";
  version: 2;
  specificationVersion: "2";
  uiLocale: "en-GB";
  modelId: string;
  configuration: PersonaConfig;
  reference: CountryMerchantReference;
  referenceHash: string;
  assumptions: Assumptions;
}
export interface ValidationIssue {
  path: string;
  message: string;
}
