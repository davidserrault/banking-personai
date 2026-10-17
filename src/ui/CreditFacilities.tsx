import { useState } from "react";
import type { CreditFacility, PersonaConfig } from "../domain/types";
import { creditTypes, newCreditFacility } from "../config/credit-facilities";
import { facilityLoan } from "../engine/loans";
import { Field, Section, Toggle, AddButton, DeleteButton } from "./controls";
import { dateLabel, endDate, money, newId } from "./format";

export function CreditFacilities({
  config: c,
  update,
}: {
  config: PersonaConfig;
  update: (fn: (c: PersonaConfig) => void) => void;
}) {
  const [type, setType] = useState<CreditFacility["type"]>("personal");
  let horizonEnd = c.startDate;
  try {
    horizonEnd = endDate(c);
  } catch {
    /* Keep the editor usable while the horizon is incomplete. */
  }
  return (
    <Section
      title="Credit facilities"
      description="Add loans. Defaults are illustrative and editable. Proceeds are credited to the current account on the start date; monthly repayments begin one month later. Payment cards are configured in their own section."
    >
      <div className="credit-add">
        <Field
          label="Credit type"
          value={type}
          options={Object.entries(creditTypes)
            .filter(([id]) => id !== "card")
            .map(([id, v]) => [id, v.label])}
          onChange={setType}
        />
        <AddButton
          disabled={(c.creditFacilities?.length ?? 0) >= 30}
          onClick={() =>
            update((d) => {
              (d.creditFacilities ??= []).push(
                newCreditFacility(type, newId("credit"), d.startDate),
              );
            })
          }
        >
          Add {creditTypes[type].label.toLowerCase()}
        </AddButton>
      </div>
      {!c.creditFacilities?.length && (
        <p className="muted">No credit facilities added.</p>
      )}
      {c.creditFacilities?.map((facility, index) => {
        let loan;
        try {
          loan = facilityLoan(facility, c, horizonEnd);
        } catch {
          /* Incomplete input is validated by the shared configuration validator. */
        }
        const change = (patch: Partial<CreditFacility>) =>
          update((d) => Object.assign(d.creditFacilities![index], patch));
        return (
          <div className="editor-card" key={facility.id}>
            <div className="card-actions">
              <Toggle
                label={facility.label || creditTypes[facility.type].label}
                value={facility.enabled}
                onChange={(enabled) => change({ enabled })}
              />
              <DeleteButton
                label={"Remove " + facility.label}
                onClick={() =>
                  update((d) => {
                    d.creditFacilities!.splice(index, 1);
                  })
                }
              />
            </div>
            <div className="form-grid">
              <Field
                label="Facility name"
                value={facility.label}
                path={`creditFacilities.${index}.label`}
                onChange={(label) => change({ label })}
              />
              <Field
                label="Start date"
                type="date"
                value={facility.startDate}
                path={`creditFacilities.${index}.startDate`}
                onChange={(startDate) => change({ startDate })}
              />
              <Field
                label={`Borrowed amount · ${c.displayCurrency ?? c.currency}`}
                type="number"
                value={facility.amount}
                min={10 ** -c.currencyDigits}
                max={1e8}
                step={10 ** -c.currencyDigits}
                path={`creditFacilities.${index}.amount`}
                onChange={(amount) => change({ amount })}
              />
              <Field
                label="Annual interest rate · %"
                type="number"
                value={facility.annualRate}
                min={0}
                max={50}
                step={0.1}
                path={`creditFacilities.${index}.annualRate`}
                onChange={(annualRate) => change({ annualRate })}
              />
              <Field
                label="Duration · months"
                type="number"
                value={facility.months}
                min={1}
                max={480}
                step={1}
                path={`creditFacilities.${index}.months`}
                onChange={(months) => change({ months })}
              />
              <div className="credit-installment">
                <span>Monthly instalment</span>
                <strong>{loan ? money(loan.installment, c) : "—"}</strong>
                <small>Principal + interest · final payment may differ</small>
              </div>
            </div>
            {facility.type === "mortgage" && (
              <Toggle
                label="Replace the existing housing charge from this start date"
                value={facility.replaceHousingCharge}
                onChange={(replaceHousingCharge) =>
                  change({ replaceHousingCharge })
                }
                hint="Avoids counting the existing housing payment twice. Separate insurance charges remain unchanged."
              />
            )}
            {facility.type === "card" && (
              <p className="field-hint">
                This is a fixed-term repayment plan for a drawn credit card
                balance, without additional spending or redraws.
              </p>
            )}
            {facility.startDate < c.startDate && (
              <p className="field-hint">
                This loan predates the history. Opening account balances should
                already include its earlier proceeds and repayments. Only the
                remaining debt and future payments are simulated.
              </p>
            )}
            {loan && (
              <div className="credit-details">
                <span>
                  First repayment:{" "}
                  <strong>{dateLabel(loan.schedule[0].dueDate, true)}</strong>
                </span>
                <span>
                  Total interest:{" "}
                  <strong>
                    {money(
                      loan.schedule.reduce(
                        (sum, row) => sum + row.interestMinor,
                        0,
                      ) /
                        10 ** c.currencyDigits,
                      c,
                    )}
                  </strong>
                </span>
              </div>
            )}
            {facility.startDate > horizonEnd && (
              <p className="field-hint">
                Starts after the current simulation period. Extend the time
                horizon to include it.
              </p>
            )}
          </div>
        );
      })}
    </Section>
  );
}
