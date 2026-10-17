import { addMonths } from "./calendar";
import { fromMinor, toMinor } from "./money";
import type { Loan } from "./types";
import type { CreditFacility, PersonaConfig } from "../domain/types";

export interface LoanInput {
  id: string;
  type: Loan["type"];
  label: string;
  eventId?: string;
  principalMinor: number;
  annualRate: number;
  months: number;
  insurance: number;
  drawDate: string;
  endDate: string;
  digits: number;
}
export function createLoan(input: LoanInput): Loan {
  const { principalMinor: capital, annualRate, months, digits } = input;
  if (
    !Number.isSafeInteger(capital) ||
    capital <= 0 ||
    !Number.isInteger(months) ||
    months < 1 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0
  )
    throw new Error("Invalid loan terms.");
  const rate = annualRate / 1200;
  const regular = Math.max(
    1,
    Math.round(
      rate === 0
        ? capital / months
        : (capital * rate) / (1 - (1 + rate) ** -months),
    ),
  );
  let remaining = capital;
  const insuranceMinor = toMinor(input.insurance, digits);
  const schedule: Loan["schedule"] = [];
  for (let i = 1; i <= months && remaining > 0; i++) {
    const interestMinor = Math.round(remaining * rate);
    const principalMinor =
      i === months
        ? remaining
        : Math.max(1, Math.min(remaining, regular - interestMinor));
    const amountMinor = principalMinor + interestMinor;
    remaining -= principalMinor;
    const dueDate = addMonths(input.drawDate, i);
    schedule.push({
      number: i,
      dueDate,
      amount: fromMinor(amountMinor, digits),
      principal: fromMinor(principalMinor, digits),
      interest: fromMinor(interestMinor, digits),
      insurance: input.insurance,
      remainingPrincipal: fromMinor(remaining, digits),
      amountMinor,
      principalMinor,
      interestMinor,
      insuranceMinor,
      remainingPrincipalMinor: remaining,
      status: dueDate > input.endDate ? "outside-window" : "scheduled",
    });
  }
  return {
    id: input.id,
    type: input.type,
    label: input.label,
    eventId: input.eventId,
    drawDate: input.drawDate,
    principal: fromMinor(capital, digits),
    principalMinor: capital,
    annualRate,
    months,
    installment: fromMinor(regular, digits),
    insurance: input.insurance,
    outstandingPrincipal: fromMinor(capital, digits),
    outstandingPrincipalMinor: capital,
    paidPrincipal: 0,
    paidInterest: 0,
    paidInsurance: 0,
    schedule,
  };
}

export function facilityLoan(
  facility: CreditFacility,
  config: Pick<PersonaConfig, "startDate" | "currencyDigits">,
  endDate: string,
): Loan {
  if (
    !Number.isFinite(facility.amount) ||
    facility.amount <= 0 ||
    facility.amount > 1e8 ||
    !Number.isInteger(facility.months) ||
    facility.months < 1 ||
    facility.months > 480 ||
    !Number.isFinite(facility.annualRate) ||
    facility.annualRate < 0 ||
    facility.annualRate > 50
  )
    throw new Error(
      "Enter valid loan terms before calculating the instalment.",
    );
  const loan = createLoan({
    id: `facility_${facility.id}`,
    type: facility.type,
    label: facility.label,
    principalMinor: toMinor(facility.amount, config.currencyDigits),
    annualRate: facility.annualRate,
    months: facility.months,
    insurance: 0,
    drawDate: facility.startDate,
    endDate,
    digits: config.currencyDigits,
  });
  loan.facilityId = facility.id;
  for (const row of loan.schedule) {
    if (row.dueDate >= config.startDate) break;
    row.status = "before-window";
    loan.outstandingPrincipalMinor = row.remainingPrincipalMinor;
  }
  loan.outstandingPrincipal = fromMinor(
    loan.outstandingPrincipalMinor,
    config.currencyDigits,
  );
  return loan;
}

export function replacesHousing(config: PersonaConfig, date: string): boolean {
  return (config.creditFacilities ?? []).some(
    (loan) =>
      loan.enabled &&
      loan.type === "mortgage" &&
      loan.replaceHousingCharge &&
      loan.startDate <= date,
  );
}
