import { spendingCategories as categories } from "../domain/categories";
import type {
  SpendingMode,
  SpendingModeKind,
  TriggerMetric,
  ModeTrigger,
} from "../domain/modes";
import { canonicalJson } from "./canonical";
export const modeNames: Record<SpendingModeKind, string> = {
  survival: "Survival",
  yolo: "YOLO",
  balanced: "Balanced",
  investor: "Investor",
  planner: "Planner",
};
export const modeDescriptions: Record<SpendingModeKind, string> = {
  survival:
    "Protect essentials, choose cheaper purchases and suspend new savings.",
  yolo: "Enjoy more frequent, larger purchases using available savings and permitted overdraft.",
  balanced:
    "Aim for 50% needs, 30% wants and 20% future security, with obligations first.",
  investor:
    "Reduce consumption and direct spare cash towards eligible investments.",
  planner: "Build liquid reserves and prepare for known future expenses.",
};
export const triggerLabels: Record<TriggerMetric, string> = {
  monthlyIncomeGrowth: "Monthly income above historical average (%)",
  unexpectedIncome: "Unexpected income today",
  salaryDecrease: "Salary decrease (%)",
  incomeAbsentDays: "Days without income",
  bonusReceived: "Bonus received today",
  refundReceived: "Refund received today",
  incomeReceived: "Matching income received today",
  checkingBalance: "Current account balance",
  savingsBalance: "Liquid savings balance",
  liquidAssetsMonths: "Liquid assets (months of expenses)",
  availableLiquidity: "Available liquidity",
  netWorth: "Net bank wealth",
  netWorthDecline: "Net bank wealth decrease from peak (%)",
  investmentBalance: "Investment balance",
  emergencyFundMonths: "Liquid savings (months of expenses)",
  discretionaryPercent: "Monthly discretionary spending (% of baseline)",
  categorySpending: "Category spending this month",
  overspendingMonths: "Consecutive months spending exceeds income",
  unexpectedExpense: "Unexpected expense today",
  date: "Exact date",
  dateRange: "Date range",
  dayOfMonth: "Day of month",
  monthOfYear: "Month of year",
  daysBeforeSalary: "Days before next salary",
  daysAfterSalary: "Days after last salary",
};
// Existing specialized triggers remain readable; new rules use one income selector and the schedule fields.
export const modeConditionOptions = Object.entries(triggerLabels).filter(
  ([key]) =>
    ![
      "unexpectedIncome",
      "bonusReceived",
      "refundReceived",
      "date",
      "dateRange",
    ].includes(key),
) as [TriggerMetric, string][];
export function newModeCondition(
  metric: TriggerMetric = "checkingBalance",
): ModeTrigger {
  return {
    metric,
    operator: [
      "checkingBalance",
      "daysBeforeSalary",
      "daysAfterSalary",
    ].includes(metric)
      ? "lt"
      : "gt",
    value: ["daysBeforeSalary", "daysAfterSalary"].includes(metric)
      ? 7
      : metric === "incomeAbsentDays"
        ? 14
        : metric === "checkingBalance"
          ? 500
          : metric === "monthlyIncomeGrowth"
            ? 20
            : metric === "discretionaryPercent"
              ? 120
              : 0,
    ...(metric === "categorySpending" ? { category: "restaurants" } : {}),
    ...(["dayOfMonth", "monthOfYear"].includes(metric)
      ? { operator: "eq" as const, value: 1 }
      : {}),
  };
}
export function uniqueModeConditions(rules: ModeTrigger[]): ModeTrigger[] {
  const seen = new Set<string>();
  return rules.filter((r) => {
    const key = canonicalJson(
      Object.fromEntries(
        Object.entries(r).filter(([, value]) => value !== "any"),
      ),
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function newSpendingMode(
  kind: SpendingModeKind,
  id: string,
  startDate: string,
): SpendingMode {
  const rules = Object.fromEntries(
    categories.map((c) => {
      const fixed =
        c.parentId === 159 || ["bankfees", "incidentfees"].includes(c.key);
      let amount = 1,
        frequency = 1;
      if (!fixed) {
        if (kind === "survival") {
          amount = c.protected ? (c.parentId === 163 ? 1 : 0.65) : 0.6;
          frequency = c.protected
            ? c.parentId === 163
              ? 1
              : 0.8
            : [
                  "shoppingOthers",
                  "homeImprovement",
                  "restaurants",
                  "fastfood",
                ].includes(c.key)
              ? 0.05
              : 0;
        }
        if (kind === "yolo" && !c.protected) {
          amount = 1.5;
          frequency = c.key === "travel" ? 1.5 : 2;
        }
        if (kind === "balanced" && !c.protected) {
          amount = 0.95;
          frequency = 0.9;
        }
        if (kind === "investor") {
          amount = c.protected ? (c.parentId === 163 ? 1 : 0.9) : 0.7;
          frequency = c.protected ? 1 : 0.4;
        }
        if (kind === "planner") {
          amount = c.protected ? (c.parentId === 163 ? 1 : 0.95) : 0.9;
          frequency = c.protected ? 1 : 0.65;
        }
      }
      return [
        c.key,
        {
          amount,
          frequency,
          ...(kind === "survival" && c.key === "restaurants"
            ? { substituteTo: "groceries", substitutionShare: 0.1 }
            : {}),
        },
      ];
    }),
  );
  return {
    id,
    label: modeNames[kind],
    kind,
    enabled: true,
    active: true,
    priority: kind === "survival" ? 100 : 50,
    intensity: 1,
    startDate,
    duration: 30,
    recurrence: "none",
    cooldown: 7,
    transitionDuration: 0,
    activationTriggers: { match: "all", rules: [] },
    deactivationTriggers: { match: "any", rules: [] },
    categoryRules: rules,
    savingsRules: {
      contributionMultiplier: ["survival", "yolo"].includes(kind)
        ? 0
        : kind === "planner"
          ? 1
          : 0.5,
      withdrawals: kind === "yolo" ? "available" : "essentials",
      withdrawalLimitPercent: kind === "balanced" ? 25 : 100,
    },
    investmentRules: {
      contributionMultiplier:
        kind === "investor"
          ? 1
          : kind === "balanced"
            ? 0.5
            : kind === "planner"
              ? 0.1
              : 0,
      withdrawAfterDays: kind === "yolo" ? 30 : null,
    },
    debtRules: { allowOverdraft: kind === "yolo", allowBorrowing: false },
    liquidityTarget: kind === "survival" ? 0 : kind === "yolo" ? 100 : 500,
    randomness: 0.1,
    allocation: { needs: 50, wants: 30, future: 20 },
    preferCheapMerchants: kind === "survival",
    planningDays: kind === "planner" ? 90 : 0,
  };
}
