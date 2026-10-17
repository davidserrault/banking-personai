import type { CreditFacility } from "../domain/types";

/** Illustrative scenario defaults, not live lending offers. Amounts use the persona currency. */
export const creditTypes: Record<
  CreditFacility["type"],
  { label: string; amount: number; annualRate: number; months: number }
> = {
  mortgage: { label: "Mortgage", amount: 200000, annualRate: 3.5, months: 240 },
  auto: { label: "Auto loan", amount: 20000, annualRate: 5, months: 60 },
  personal: {
    label: "Personal loan",
    amount: 10000,
    annualRate: 6,
    months: 48,
  },
  student: {
    label: "Student loan",
    amount: 15000,
    annualRate: 2.5,
    months: 120,
  },
  card: { label: "Credit card", amount: 2500, annualRate: 18, months: 24 },
};
export function newCreditFacility(
  type: CreditFacility["type"],
  id: string,
  startDate: string,
): CreditFacility {
  return {
    id,
    type,
    ...creditTypes[type],
    startDate,
    enabled: true,
    replaceHousingCharge: type === "mortgage",
  };
}
