import { CategoryField } from "./CategoryField";
import type {
  PersonaConfig,
  TaxSystem,
  TaxPayment,
  TaxFrequency,
} from "../domain/types";
import { defaultIncomeTax, taxEstimate } from "../engine/taxes";
import { Field, Section, Toggle, AddButton, DeleteButton } from "./controls";
import { money, newId } from "./format";

const frequencies: [string, string][] = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annual", "Yearly"],
];
function PaymentFields({
  value,
  onChange,
  prefix,
}: {
  value: TaxPayment;
  onChange: (p: Partial<TaxPayment>) => void;
  prefix: string;
}) {
  return (
    <>
      <Field
        label={prefix + " frequency"}
        value={value.frequency}
        options={frequencies}
        onChange={(frequency: TaxFrequency) => onChange({ frequency })}
      />
      <Field
        label={prefix + " payment day"}
        type="number"
        min={1}
        max={31}
        value={value.day}
        onChange={(day) => onChange({ day })}
      />
      {value.frequency === "annual" && (
        <Field
          label={prefix + " payment month"}
          type="number"
          min={1}
          max={12}
          value={value.month}
          onChange={(month) => onChange({ month })}
        />
      )}
    </>
  );
}
export function Taxes({
  config: c,
  system,
  update,
}: {
  config: PersonaConfig;
  system?: TaxSystem;
  update: (fn: (c: PersonaConfig) => void) => void;
}) {
  const payment = c.incomeTax ?? defaultIncomeTax();
  let estimate;
  try {
    estimate = taxEstimate(c, system);
  } catch {}
  return (
    <Section
      title="Taxes"
      description="Income tax uses annualized configured income and the progressive grid in Reference. Other tax amounts are per payment. Quarterly payments fall in March, June, September and December."
    >
      <div className="editor-card">
        <Toggle
          label="Income tax"
          value={payment.enabled}
          onChange={(enabled) =>
            update((d) => {
              d.incomeTax = { ...payment, enabled };
            })
          }
        />
        {estimate && (
          <div className="tax-summary">
            <span>
              Tax shares<strong>{estimate.shares}</strong>
            </span>
            <span>
              Annualized income
              <strong>{money(estimate.annualIncome, c)}</strong>
            </span>
            <span>
              Marginal tax rate<strong>{estimate.marginalRate}%</strong>
            </span>
            <span>
              Annual income tax<strong>{money(estimate.annualTax, c)}</strong>
            </span>
            <span>
              Average monthly tax
              <strong>{money(estimate.annualTax / 12, c)}</strong>
            </span>
          </div>
        )}
        <div className="form-grid">
          <PaymentFields
            value={payment}
            prefix="Income tax"
            onChange={(patch) =>
              update((d) => {
                d.incomeTax = { ...payment, ...patch };
              })
            }
          />
        </div>
        <p className="field-hint">
          Uses configured income before this simulated tax, including annual
          growth. No deductions or tax credits are assumed.
        </p>
      </div>
      <AddButton
        onClick={() =>
          update((d) => {
            (d.otherTaxes ??= []).push({
              id: newId("tax"),
              label: "Property tax",
              amount: 1200,
              enabled: true,
              frequency: "annual",
              day: 15,
              month: 10,
            });
          })
        }
      >
        Add other tax
      </AddButton>
      {c.otherTaxes?.map((tax, i) => {
        const change = (patch: Partial<typeof tax>) =>
          update((d) => {
            Object.assign(d.otherTaxes![i], patch);
          });
        return (
          <div className="editor-card" key={tax.id}>
            <div className="card-actions">
              <Toggle
                label={tax.label || "Other tax"}
                value={tax.enabled}
                onChange={(enabled) => change({ enabled })}
              />
              <DeleteButton
                label={"Remove " + tax.label}
                onClick={() =>
                  update((d) => {
                    d.otherTaxes!.splice(i, 1);
                  })
                }
              />
            </div>
            <div className="form-grid">
              <Field
                label="Tax name"
                value={tax.label}
                onChange={(label) => change({ label })}
                hint="For example: local residence tax, property tax or another tax."
              />
              <CategoryField
                label="Tax category"
                scope="tax"
                numeric
                value={tax.categoryId ?? 302}
                onChange={(v) => change({ categoryId: Number(v) })}
              />
              <Field
                label={
                  "Tax amount per payment · " +
                  (c.displayCurrency ?? c.currency)
                }
                type="number"
                min={0}
                step={10 ** -c.currencyDigits}
                value={tax.amount}
                onChange={(amount) => change({ amount })}
              />
              <PaymentFields
                value={tax}
                prefix={tax.label || "Tax"}
                onChange={change}
              />
            </div>
          </div>
        );
      })}
    </Section>
  );
}
