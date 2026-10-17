import { useState } from "react";
import type {
  PaymentCard,
  PaymentCardType,
  PersonaConfig,
} from "../domain/types";
import {
  effectivePaymentCards,
  newPaymentCard,
  paymentCardTypes,
  selectedPaymentCard,
} from "../config/payment-cards";
import { Field, Section, AddButton, DeleteButton } from "./controls";
import { money, newId } from "./format";

export function PaymentCards({
  config: c,
  update,
}: {
  config: PersonaConfig;
  update: (fn: (c: PersonaConfig) => void) => void;
}) {
  const [type, setType] = useState<PaymentCardType>("debit");
  const cards = effectivePaymentCards(c);
  const active = selectedPaymentCard(c);
  const options = Object.entries(paymentCardTypes) as [
    PaymentCardType,
    string,
  ][];
  const edit = (fn: (d: PersonaConfig) => void) =>
    update((d) => {
      d.paymentCards ??= effectivePaymentCards(d);
      d.defaultPaymentCardId ??= d.paymentCards[0].id;
      fn(d);
    });
  return (
    <Section
      title="Payment cards"
      description="Choose the card used for purchases. Recurring charges, taxes and loan payments stay on the current account."
    >
      <div className="credit-add">
        <Field
          label="Card type to add"
          value={type}
          options={options}
          onChange={setType}
        />
        <AddButton
          disabled={cards.length >= 20}
          onClick={() =>
            edit((d) =>
              d.paymentCards!.push(newPaymentCard(type, newId("card"))),
            )
          }
        >
          Add {paymentCardTypes[type].toLowerCase()}
        </AddButton>
      </div>
      <Field
        label="Card used for purchases"
        value={active.id}
        options={cards.map((card) => [
          card.id,
          card.label === paymentCardTypes[card.type]
            ? card.label
            : `${card.label} · ${paymentCardTypes[card.type]}`,
        ])}
        path="defaultPaymentCardId"
        onChange={(id) =>
          edit((d) => {
            d.defaultPaymentCardId = id;
          })
        }
      />
      {cards.map((card, index) => {
        const change = (patch: Partial<PaymentCard>) =>
          edit((d) => Object.assign(d.paymentCards![index], patch));
        const number = (
          label: string,
          key: keyof PaymentCard,
          min: number,
          max: number,
          step: number | string = "any",
          hint?: string,
        ) => (
          <Field
            label={label}
            value={card[key] as number}
            type="number"
            min={min}
            max={max}
            step={step}
            path={`paymentCards.${index}.${key}`}
            hint={hint}
            onChange={(value) => change({ [key]: value })}
          />
        );
        return (
          <div className="editor-card" key={card.id}>
            <div className="card-actions">
              <h3>
                {card.label}{" "}
                {card.id === active.id && (
                  <span className="muted">· Used for purchases</span>
                )}
              </h3>
              {cards.length > 1 && (
                <DeleteButton
                  label={`Remove ${card.label}`}
                  onClick={() =>
                    edit((d) => {
                      d.paymentCards!.splice(index, 1);
                      if (d.defaultPaymentCardId === card.id)
                        d.defaultPaymentCardId = d.paymentCards![0].id;
                    })
                  }
                />
              )}
            </div>
            <div className="form-grid">
              <Field
                label="Card name"
                value={card.label}
                path={`paymentCards.${index}.label`}
                onChange={(label) => change({ label })}
              />
              <Field
                label="Card type"
                value={card.type}
                options={options}
                path={`paymentCards.${index}.type`}
                onChange={(next: PaymentCardType) =>
                  change({
                    type: next,
                    ...(card.label === paymentCardTypes[card.type]
                      ? { label: paymentCardTypes[next] }
                      : {}),
                  })
                }
              />
              {number(
                `Authorized overdraft · ${c.displayCurrency ?? c.currency}`,
                "authorizedOverdraft",
                0,
                1e8,
                10 ** -c.currencyDigits,
                "Applies to the current account for this card's payments and repayments.",
              )}
              {number(
                "Authorized overdraft annual rate · %",
                "overdraftAnnualRate",
                0,
                100,
                0.1,
                "Interest on this card's use of the authorized overdraft is debited monthly.",
              )}
              {card.type !== "debit" &&
                number(
                  card.type === "credit"
                    ? "Monthly interest debit day"
                    : "Monthly settlement day",
                  "settlementDay",
                  1,
                  31,
                  1,
                  "Days 29–31 use the last available day in shorter months.",
                )}
              {card.type === "credit" && (
                <>
                  {number(
                    "Credit annual interest rate · %",
                    "creditAnnualRate",
                    0,
                    100,
                    0.1,
                    "Monthly interest = remaining unpaid balance × annual rate ÷ 12. Due repayments are applied first.",
                  )}
                  <Field
                    label="Repayment frequency"
                    value={card.repaymentFrequency}
                    options={[
                      ["weekly", "Weekly"],
                      ["monthly", "Monthly"],
                      ["quarterly", "Quarterly"],
                      ["annual", "Yearly"],
                    ]}
                    path={`paymentCards.${index}.repaymentFrequency`}
                    onChange={(repaymentFrequency) =>
                      change({
                        repaymentFrequency,
                        repaymentDay: Math.min(
                          card.repaymentDay,
                          repaymentFrequency === "weekly" ? 7 : 31,
                        ),
                      })
                    }
                  />
                  <Field
                    label="Repayment calculation"
                    value={card.repaymentMode}
                    options={[
                      ["amount", "Fixed amount"],
                      ["percent", "% of remaining balance"],
                    ]}
                    path={`paymentCards.${index}.repaymentMode`}
                    onChange={(repaymentMode) => change({ repaymentMode })}
                  />
                  {card.repaymentMode === "amount"
                    ? number(
                        `Repayment amount · ${c.displayCurrency ?? c.currency}`,
                        "repaymentAmount",
                        0,
                        1e8,
                        10 ** -c.currencyDigits,
                      )
                    : number(
                        "Repayment · % of remaining balance",
                        "repaymentPercent",
                        0,
                        100,
                        0.1,
                      )}
                  {card.repaymentFrequency === "weekly" ? (
                    <Field
                      label="Repayment weekday"
                      value={String(card.repaymentDay)}
                      options={[
                        ["1", "Monday"],
                        ["2", "Tuesday"],
                        ["3", "Wednesday"],
                        ["4", "Thursday"],
                        ["5", "Friday"],
                        ["6", "Saturday"],
                        ["7", "Sunday"],
                      ]}
                      path={`paymentCards.${index}.repaymentDay`}
                      onChange={(day) => change({ repaymentDay: Number(day) })}
                    />
                  ) : (
                    number("Repayment day", "repaymentDay", 1, 31, 1)
                  )}
                  {["quarterly", "annual"].includes(card.repaymentFrequency) &&
                    number(
                      "Repayment reference month · 1–12",
                      "repaymentMonth",
                      1,
                      12,
                      1,
                    )}
                </>
              )}
            </div>
            {card.type !== "debit" && (
              <p className="field-hint">
                Dedicated {paymentCardTypes[card.type].toLowerCase()} account ·
                Initial balance {money(0, c)}. Payments are transferred from the
                current account. Unpaid amounts remain on the card account when
                funds and the authorized overdraft are insufficient.
              </p>
            )}
          </div>
        );
      })}
    </Section>
  );
}
