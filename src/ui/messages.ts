import supplied from "../../specifications/i18n/en-GB.json";
export const messages = {
  ...supplied,
  models: { andre: "André", ...supplied.models },
  navigation: {
    ...supplied.navigation,
    accounts: "Accounts",
    charges: "Charges",
    modes: "Modes",
  },
  frequency: { ...supplied.frequency, once: "Once" },
  reference: {
    ...supplied.reference,
    envelopes: "Budget",
    addEnvelope: "Add budget",
    mean: "Average purchase",
  },
  studio: {
    modesTitle: "Temporary spending behaviours",
    modesIntro:
      "Apply a strategy for a period of time or in response to a financial change.",
    fixed: "Housing & commitments",
    dailyPurchase: "Everyday purchase",
    mortgagePayment: "Mortgage payment",
    rent: "Rent",
    energy: "Energy",
    childCosts: "Childcare",
    seasonalNote:
      "Monthly frequency and basket factors use the applied scenario assumptions.",
    transfer: "Internal transfer",
    repayment: "Loan repayment",
    configurationIntro:
      "Create realistic bank account histories for fictional banking customers.",
    process: {
      budget: {
        title: "Review the persona context",
        description: "Set living costs in Profile and budgets in Behaviour.",
      },
      merchants: {
        title: "Tune purchase patterns",
        description: "Link average purchase amounts and frequency.",
      },
      apply: {
        title: "Confirm or download",
        description:
          "Confirm edits to update history, or save your reference settings.",
      },
      define: {
        title: "Define a persona",
        description: "Choose a profile and set up their income and accounts.",
      },
      shape: {
        title: "Shape their behaviour",
        description: "Adjust spending, savings and life events.",
      },
      export: {
        title: "Explore and export",
        description: "Review the generated history and download your data.",
      },
    },
    recalculating: "Recalculating history…",
    profileTitle: "Meet your persona",
    profileIntro:
      "The people, places and circumstances behind everyday spending.",
    accountTitle: "A place for every balance",
    accountIntro:
      "Set up bank accounts, payment cards, savings and credit facilities.",
    chargesTitle: "Plan the regular outgoings",
    chargesIntro: "Set recurring charges and tax payments.",
    behaviorTitle: "Everyday financial rhythms",
    behaviorIntro:
      "Define how your persona spends, saves and responds to a low balance.",
    eventsTitle: "Life changes the numbers",
    eventsIntro: "Put the moments that matter on your persona’s timeline.",
    horizonTitle: "Set the story in motion",
    horizonIntro:
      "The same seed and applied settings always create the same history.",
    referenceIntro:
      "Tune merchant purchase patterns using the context and budget defined in Configuration.",
    historyIntro:
      "A complete, reproducible view of your persona’s financial life.",
    identity: "Identity & household",
    location: "Location & lifestyle",
    enabled: "Enabled",
    remove: "Remove",
    duplicate: "Duplicate",
    automatic: "Automatic",
    custom: "Custom",
    assumptions: "Scenario assumptions",
    savedAssumptions: "Rates and prices are stored scenario assumptions.",
    synthetic: "Fictional people. Realistic patterns.",
    live: "Live simulation",
    revision: "Reproducible by design",
    workshop: "Synthetic banking data studio",
    dataContext: "DATA CONTEXT",
    showAdvanced: "Advanced settings",
    source: "Source",
    sources: "Reference sources",
    showSources: "View sources & assumptions",
    current: "Current",
    inactive: "Inactive",
    eligible: "Available",
    unavailable: "Unavailable",
    monthly: "per month",
    perYear: "per year",
    totalAssets: "Total bank assets",
    debt: "Outstanding debt",
    netAssets: "Net bank assets",
    interestMode: "Interest accrual",
    daily: "Daily",
    fortnight: "Fortnightly",
    type: "Account type",
    noCeiling: "No deposit ceiling",
    rank: "Priority (0 excludes)",
    category: "Category",
    segment: "Segment",
    enabledMerchant: "Scenario merchant",
    addMerchant: "Add scenario merchant",
    merchantName: "Merchant name",
    reserve: "Cash reserve",
    spending: "Spending preferences",
    savings: "Savings priorities",
    automaticBudgets: "Monthly spending budget",
    protected: "Protected",
    discretionary: "Discretionary",
    prioritiesNote:
      "Smaller ranks are used first. Set zero to exclude an account.",
    seedNote:
      "Preserve the seed to reproduce this scenario, or choose a new one to explore another history.",
    period: "Simulation period",
    years: "years",
    days: "days",
    noEvents: "What happens next?",
    emptyEvents:
      "Plan a trip, a new car, a change in income, or another moment that reshapes the ledger.",
    noIncome: "No income sources. Add one to schedule payments.",
    frequencyNote:
      "Amounts are paid per occurrence, not necessarily per month.",
    financingNote:
      "Expenses draw on current cash, eligible savings, then permitted credit. Any shortfall can leave the current account negative.",
    mortgageNote:
      "Principal cannot exceed the purchase price and additional costs.",
    reset: "Reset",
    apply: "Apply changes",
    pending: "Unapplied changes",
    discard: "Discard changes",
    noMatches: "No matching results.",
    importError: "Could not load the file.",
    exportError: "Could not download the file.",
    retry: "Retry simulation",
    resultOld:
      "Showing the previous history. Downloads will be available when the current settings finish calculating.",
    incomeExclusion:
      "Internal transfers and loan drawdowns are excluded from income. Internal transfers are excluded from expenses.",
    summaryScope: "All accounts · selected summary period",
    tableScope:
      "Account filters only affect the table. Downloads always contain the complete selected account history.",
    allCategories: "All categories",
    any: "All",
    of: "of",
    page: "Page",
    showing: "Showing",
    noHistory: "Your ledger is taking shape",
    noHistoryNote:
      "The simulation will appear here once your settings are valid.",
    transactions: "transactions",
    loans: "Loans",
    principal: "Principal",
    interest: "Interest",
    insurance: "Insurance",
    remaining: "Remaining",
    status: "Status",
    paid: "Paid",
    outside: "Outside simulation period",
    noBorrowing: "No borrowing in this scenario.",
    opening: "Opening",
    closing: "Closing",
    positive: "Positive balance",
    negative: "Negative balance",
    exportAll: "All accounts · JSON",
    exportSelected: "Selected account · JSON",
    exportDetails: "Download events & financing",
    exportAudit: "Download deferred spending",
    jsonPreview: "Statement format preview",
    countryNote:
      "A merchant file supplies a local catalog. It does not establish local banking rules or representative consumption statistics.",
    countryCurrent: "Applied country",
    countryTarget: "Target country",
    file: "Reference file",
    noFile: "Select a local merchant reference JSON file.",
    fxPreview: "Currency conversion preview",
    setting: "Setting",
    before: "Before",
    after: "After",
    missing: "Categories with no eligible merchants",
    missingDecision: "Choose how to treat each category before applying.",
    choose: "Choose…",
    zero: "Set to zero",
    keepInactive: "Keep explicitly inactive",
    noDraft: "Changes stay in this draft until you apply them.",
    discardPrompt: "Discard unapplied reference changes and load this persona?",
    loaded: "Configuration loaded",
    saved: "Download started",
    applied: "Reference applied",
    genericIncome: "Income",
    genericCharge: "Recurring charge",
    genericSavings: "Savings account",
    allPeriods: "Entire period",
    annual: "Year",
    month: "Month",
    expenseMix: "Where the money goes",
    incomeMix: "Where the money comes from",
    keyboardChart:
      "Daily closing balances. Use the account selector to change the chart. Exact balances are available in the transaction table and download.",
    operations: "Operations",
    fingerprint: "Financial fingerprint",
    engine: "Engine version",
    reference: "Reference",
    provenance: "Provenance",
    assumptionNote:
      "Synthetic scenarios for design, development and testing. No real customer data or live bank connection.",
    referencePending:
      "Your reference draft is preserved. Other configuration edits continue to apply normally.",
    chooseFile: "Choose JSON file",
    birthCategory: "Affected categories",
    householdLimit: "Household size includes children.",
  },
};
export type MessagePath = string;
export function t(path: MessagePath): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      messages,
    );
  if (typeof value !== "string")
    throw new Error(`Missing English message: ${path}`);
  return value;
}
export function options(group: keyof typeof supplied.options) {
  return Object.entries(supplied.options[group]);
}
export const categoryLabel = (key: string) =>
  (supplied.categories as Record<string, string>)[key] ??
  (
    {
      fixed: t("studio.fixed"),
      income: t("history.income"),
      transfers: t("studio.transfer"),
      credit: t("history.principal"),
      loan: t("studio.repayment"),
      insurance: t("studio.insurance"),
      energy: t("studio.energy"),
      housing: t("profile.housing"),
      children: t("studio.childCosts"),
      other: t("history.other"),
    } as Record<string, string>
  )[key] ??
  key;
export const enumLabel = (group: string, key: string) => {
  const registry = (messages as Record<string, unknown>)[group] as
    | Record<string, string>
    | undefined;
  return registry?.[key] ?? key;
};
