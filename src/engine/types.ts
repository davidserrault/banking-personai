export type SimulationKind =
  | "tax"
  | "income"
  | "inheritance"
  | "daily"
  | "recurring"
  | "habit"
  | "event"
  | "travel"
  | "transfer"
  | "support"
  | "savings-interest"
  | "card-interest"
  | "card-overdraft-interest"
  | "credit-drawdown"
  | "credit-repayment"
  | "credit-insurance";
export interface FXDetails {
  originalAmount: number;
  originalCurrency: string;
  originalMinor: number;
  exchangeRate: number;
  convention: "foreign-per-settlement";
  fee: number;
  feeMinor: number;
  baseMinor: number;
}
export interface Transaction {
  paymentCardId?: string;
  modeId?: string;
  id: number;
  accountKey: string;
  accountId: number;
  date: string;
  accountingDate: string;
  amount: number;
  amountMinor: number;
  balanceAfter: number;
  balanceAfterMinor: number;
  categoryId: number;
  parentCategoryId: number;
  category: string;
  label: string;
  currency: string;
  simulationKind: SimulationKind;
  merchantId?: number;
  transferId?: string;
  transferRuleId?: string;
  incomeId?: string;
  eventId?: string;
  loanId?: string;
  fx?: FXDetails;
  principal?: number;
  interest?: number;
}
export interface LoanScheduleRow {
  number: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  insurance: number;
  remainingPrincipal: number;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
  insuranceMinor: number;
  remainingPrincipalMinor: number;
  status: "scheduled" | "paid" | "outside-window" | "before-window";
  paidDate?: string;
}
export interface Loan {
  id: string;
  type: "consumer" | "card" | "mortgage" | "auto" | "personal" | "student";
  facilityId?: string;
  label: string;
  eventId?: string;
  drawDate: string;
  principal: number;
  principalMinor: number;
  annualRate: number;
  months: number;
  installment: number;
  insurance: number;
  outstandingPrincipal: number;
  outstandingPrincipalMinor: number;
  paidPrincipal: number;
  paidInterest: number;
  paidInsurance: number;
  schedule: LoanScheduleRow[];
}
export interface EventResult {
  sourceEventId?: string;
  recurrence?: "monthly" | "yearly";
  id: string;
  type: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "completed" | "active" | "scheduled";
  expenses: number;
  receipts: number;
  borrowed: number;
  transactionCount: number;
  loanIds: string[];
  originalBudget?: number;
  originalCurrency?: string;
}
export interface AccountResult {
  paymentCardId?: string;
  key: string;
  id: number;
  name: string;
  bank: string;
  type: string;
  openingBalance: number;
  closingBalance: number;
  accruedInterest: number;
}
export interface DailyBalance {
  modeId?: string;
  modeIntensity?: number;
  date: string;
  checking: number;
  assets: number;
  debt: number;
  netAssets: number;
  accounts: Record<string, number>;
}
export interface AuditEntry {
  transferRuleId?: string;
  date: string;
  kind: string;
  message: string;
  eventId?: string;
  amount?: number;
}
export interface SimulationSummary {
  openingBalance: number;
  closingBalance: number;
  openingAssets: number;
  assets: number;
  debt: number;
  netAssets: number;
  income: number;
  expenses: number;
  transfers: number;
  interest: number;
  borrowed: number;
  transactionCount: number;
  minimumChecking: number;
  negativeDays: number;
}
export interface MonthlyTotal {
  month: string;
  transactionCount: number;
  income: number;
  expenses: number;
  closingBalance: number;
  assets: number;
  debt: number;
}
export interface SimulationResult {
  engineVersion: string;
  fingerprint: string;
  referenceHash: string;
  startDate: string;
  endDate: string;
  currency: string;
  currencyDigits: number;
  monthlyTotals: MonthlyTotal[];
  modeHistory: {
    modeId: string;
    label: string;
    kind: import("../domain/modes").SpendingModeKind;
    startDate: string;
    endDate: string;
    days: number;
  }[];
  accounts: AccountResult[];
  transactions: Transaction[];
  dailyBalances: DailyBalance[];
  loans: Loan[];
  events: EventResult[];
  audit: AuditEntry[];
  summary: SimulationSummary;
  monthlyEnvelopes: Record<string, number>;
}
