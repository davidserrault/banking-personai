import type {
  LedgerAccount,
  PaymentCard,
  PaymentCardType,
  PersonaConfig,
} from "../domain/types";

export const paymentCardTypes: Record<PaymentCardType, string> = {
  debit: "Debit card",
  "deferred-debit": "Deferred debit card",
  credit: "Credit card",
};
export const paymentCardAccountKey = (id: string) => `card:${id}`;
export function newPaymentCard(
  type: PaymentCardType = "debit",
  id = "default-debit",
): PaymentCard {
  return {
    id,
    type,
    label: paymentCardTypes[type],
    authorizedOverdraft: 0,
    overdraftAnnualRate: 0,
    settlementDay: 1,
    creditAnnualRate: 20,
    repaymentFrequency: "monthly",
    repaymentDay: 1,
    repaymentMonth: 1,
    repaymentMode: "percent",
    repaymentAmount: 100,
    repaymentPercent: 10,
  };
}
export const effectivePaymentCards = (config: PersonaConfig): PaymentCard[] =>
  config.paymentCards ?? [newPaymentCard()];
export const selectedPaymentCard = (config: PersonaConfig): PaymentCard => {
  const cards = effectivePaymentCards(config);
  return (
    cards.find((card) => card.id === config.defaultPaymentCardId) ?? cards[0]
  );
};
/** Card ledgers are generated from card settings and always open at zero. */
export function ledgerAccounts(config: PersonaConfig): LedgerAccount[] {
  const bank = config.accounts.find((a) => a.type === "checking")?.bank ?? "";
  return [
    ...config.accounts,
    ...effectivePaymentCards(config)
      .filter((card) => card.type !== "debit")
      .map((card) => ({
        key: paymentCardAccountKey(card.id),
        name: card.label,
        bank,
        type:
          card.type === "credit"
            ? ("credit-card" as const)
            : ("deferred-card" as const),
        product: card.type === "credit" ? "credit-card" : "deferred-debit-card",
        paymentCardId: card.id,
        openingBalance: 0,
      })),
  ];
}
