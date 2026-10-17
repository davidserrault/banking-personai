/** Temporary strategies are stored separately from the baseline persona. */
export type SpendingModeKind =
  | "survival"
  | "yolo"
  | "balanced"
  | "investor"
  | "planner";
export type TriggerMetric =
  | "monthlyIncomeGrowth"
  | "unexpectedIncome"
  | "salaryDecrease"
  | "incomeAbsentDays"
  | "bonusReceived"
  | "refundReceived"
  | "incomeReceived"
  | "checkingBalance"
  | "savingsBalance"
  | "liquidAssetsMonths"
  | "availableLiquidity"
  | "netWorth"
  | "netWorthDecline"
  | "investmentBalance"
  | "emergencyFundMonths"
  | "discretionaryPercent"
  | "categorySpending"
  | "overspendingMonths"
  | "unexpectedExpense"
  | "date"
  | "dateRange"
  | "dayOfMonth"
  | "monthOfYear"
  | "daysBeforeSalary"
  | "daysAfterSalary";
export interface ModeTrigger {
  metric: TriggerMetric;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  category?: string;
  date?: string;
  endDate?: string;
  incomeKind?: "any" | "salary" | "bonus" | "refund" | "other";
  incomeExpected?: "any" | "expected" | "unexpected";
  incomeCadence?: "any" | "recurring" | "exceptional";
  incomeChange?: "any" | "temporary" | "persistent";
}
export interface TriggerGroup {
  match: "all" | "any";
  rules: ModeTrigger[];
}
export interface ModeCategoryRule {
  amount: number;
  frequency: number;
  substituteTo?: string;
  substitutionShare?: number;
}
export interface SpendingMode {
  id: string;
  label: string;
  kind: SpendingModeKind;
  enabled: boolean;
  active: boolean;
  priority: number;
  intensity: number;
  activationTriggers: TriggerGroup;
  deactivationTriggers: TriggerGroup;
  startDate?: string;
  endDate?: string;
  duration?: number;
  recurrence: "none" | "monthly" | "yearly";
  cooldown: number;
  transitionDuration: number;
  categoryRules: Record<string, ModeCategoryRule>;
  savingsRules: {
    contributionMultiplier: number;
    withdrawals: "never" | "essentials" | "available";
    withdrawalLimitPercent: number;
  };
  investmentRules: {
    contributionMultiplier: number;
    withdrawAfterDays: number | null;
  };
  debtRules: { allowOverdraft: boolean; allowBorrowing: boolean };
  liquidityTarget: number;
  randomness: number;
  allocation: { needs: number; wants: number; future: number };
  preferCheapMerchants: boolean;
  planningDays: number;
}
