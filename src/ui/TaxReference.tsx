import { useEffect, useState } from "react";
import type { PersonaConfig, TaxSystem } from "../domain/types";
import { defaultTaxSystem, taxEstimate } from "../engine/taxes";
import { Field, Section, AddButton, DeleteButton } from "./controls";
import { money } from "./format";

export function TaxReference({
  config,
  system,
  onChange,
}: {
  config: PersonaConfig;
  system?: TaxSystem;
  onChange: (system: TaxSystem) => void;
}) {
  const [draft, setDraft] = useState<TaxSystem>(() =>
    structuredClone(system ?? defaultTaxSystem()),
  );
  useEffect(
    () => setDraft(structuredClone(system ?? defaultTaxSystem())),
    [system],
  );
  const edit = (fn: (d: TaxSystem) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
  const valid =
    draft.rates.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) &&
    new Set(draft.rows.map((r) => r.shares)).size === draft.rows.length &&
    draft.rows.every(
      (r) =>
        Number.isFinite(r.shares) &&
        r.shares >= 0.5 &&
        r.shares <= 20 &&
        r.limits.length === draft.rates.length &&
        r.limits.at(-1) === null &&
        r.limits
          .slice(0, -1)
          .every(
            (n, i) =>
              n !== null &&
              Number.isFinite(n) &&
              n > (i ? r.limits[i - 1]! : 0) &&
              n <= 1e12,
          ),
    );
  const changed =
    JSON.stringify(draft) !== JSON.stringify(system ?? defaultTaxSystem());
  let estimate: ReturnType<typeof taxEstimate> | undefined;
  try {
    if (valid) estimate = taxEstimate(config, draft);
  } catch {}
  return (
    <Section
      title="Income tax reference"
      description="Progressive tax bands based on the supplied French-style grid. Edit rates, tax-share rows and each band's upper income limit to model another system."
    >
      {estimate && (
        <div className="tax-summary">
          <span>
            Tax shares<strong>{estimate.shares}</strong>
          </span>
          <span>
            Annualized income
            <strong>{money(estimate.annualIncome, config)}</strong>
          </span>
          <span>
            Marginal rate<strong>{estimate.marginalRate}%</strong>
          </span>
          <span>
            Annual tax{changed ? " preview" : ""}
            <strong>{money(estimate.annualTax, config)}</strong>
          </span>
          <span>
            Effective rate<strong>{estimate.effectiveRate.toFixed(2)}%</strong>
          </span>
        </div>
      )}
      <p className="field-hint">
        One adult: 1 share. Two or more adults: 2 shares. The first two children
        add 0.5 share each; every further child adds 1. Adults = household size
        − children. When a share count has no row, thresholds scale from the
        nearest row.
      </p>
      <div className="tax-table-scroll">
        <table className="tax-table">
          <thead>
            <tr>
              <th scope="col">Family quotient</th>
              {draft.rates.map((rate, i) => (
                <th key={i} scope="col">
                  <Field
                    label={"Band " + (i + 1) + " rate · %"}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={rate}
                    onChange={(value) =>
                      edit((d) => {
                        d.rates[i] = value;
                      })
                    }
                  />
                  {draft.rates.length > 1 && (
                    <DeleteButton
                      label={"Remove tax band " + (i + 1)}
                      onClick={() =>
                        edit((d) => {
                          d.rates.splice(i, 1);
                          d.rows.forEach((r) => {
                            r.limits.splice(i, 1);
                            r.limits[r.limits.length - 1] = null;
                          });
                        })
                      }
                    />
                  )}
                </th>
              ))}
              <th scope="col">Remove</th>
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, ri) => (
              <tr
                key={ri}
                className={
                  estimate?.shares === row.shares ? "selected-tax-row" : ""
                }
              >
                <th scope="row">
                  <Field
                    label={"Tax shares in row " + (ri + 1)}
                    type="number"
                    value={row.shares}
                    min={0.5}
                    max={20}
                    step={0.5}
                    onChange={(shares) =>
                      edit((d) => {
                        d.rows[ri].shares = shares;
                      })
                    }
                  />
                </th>
                {row.limits.map((limit, ci) => (
                  <td
                    key={ci}
                    className={
                      estimate?.shares === row.shares &&
                      estimate.marginalRate === draft.rates[ci]
                        ? "active-tax-band"
                        : ""
                    }
                  >
                    {limit === null ? (
                      <span>
                        Above {money(row.limits[ci - 1] ?? 0, config)}
                      </span>
                    ) : (
                      <>
                        <small>
                          {ci === 0
                            ? "Up to"
                            : "Above " +
                              money(row.limits[ci - 1] ?? 0, config) +
                              ", up to"}
                        </small>
                        <Field
                          label={
                            "Row " +
                            (ri + 1) +
                            ", band " +
                            (ci + 1) +
                            " upper limit"
                          }
                          type="number"
                          value={limit}
                          min={0}
                          step={1}
                          onChange={(value) =>
                            edit((d) => {
                              d.rows[ri].limits[ci] = value;
                            })
                          }
                        />
                      </>
                    )}
                  </td>
                ))}
                <td>
                  <DeleteButton
                    label={"Remove tax share row " + (ri + 1)}
                    disabled={draft.rows.length <= 1}
                    onClick={() =>
                      edit((d) => {
                        d.rows.splice(ri, 1);
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tax-actions">
        <AddButton
          disabled={draft.rows.length >= 30}
          onClick={() =>
            edit((d) => {
              const last = [...d.rows].sort((a, b) => b.shares - a.shares)[0];
              const shares = last.shares + 0.5;
              d.rows.push({
                shares,
                limits: last.limits.map((n) =>
                  n === null ? null : Math.round((n * shares) / last.shares),
                ),
              });
            })
          }
        >
          Add tax-share row
        </AddButton>
        <AddButton
          disabled={draft.rates.length >= 12}
          onClick={() =>
            edit((d) => {
              d.rates.splice(d.rates.length - 1, 0, d.rates.at(-1)!);
              d.rows.forEach((r) =>
                r.limits.splice(
                  r.limits.length - 1,
                  0,
                  Math.round((r.limits.at(-2) ?? 10000) * 1.5),
                ),
              );
            })
          }
        >
          Add tax band
        </AddButton>
        <button
          className="button secondary"
          onClick={() => setDraft(defaultTaxSystem())}
        >
          Reset grid
        </button>
        {changed && (
          <>
            <button
              className="button secondary"
              onClick={() =>
                setDraft(structuredClone(system ?? defaultTaxSystem()))
              }
            >
              Discard grid edits
            </button>
            <button
              className="button primary"
              disabled={!valid}
              onClick={() => onChange(draft)}
            >
              Apply tax grid
            </button>
          </>
        )}
      </div>
      {!valid && (
        <p role="alert" className="error-banner">
          Use unique tax-share rows, rates from 0 to 100%, and increasing
          positive upper limits. The final band is unlimited.
        </p>
      )}
      <p className="field-hint">
        Only the portion of income within a band receives its rate. This model
        does not include deductions, credits or tax-share caps. Payment
        frequency is set in Charges.
      </p>
    </Section>
  );
}
