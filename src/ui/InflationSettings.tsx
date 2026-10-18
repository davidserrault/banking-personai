import { categoryPath } from "../domain/categories";
import type {
  InflationRate,
  InflationSettings as Settings,
  PersonaConfig,
} from "../domain/types";
import { categories } from "../engine/consumption";
import { Field, Toggle } from "./controls";
import { categoryLabel } from "./messages";

const periods: [string, string][] = [
  ["yearly", "Yearly"],
  ["monthly", "Monthly"],
];

export function InflationSettings({
  config,
  onChange,
}: {
  config: PersonaConfig;
  onChange: (patch: Partial<PersonaConfig>) => void;
}) {
  const inflation = config.inflation ?? { rate: 0, period: "yearly" as const };
  const set = (patch: Partial<Settings>) =>
    onChange({ inflation: { ...inflation, ...patch } });
  const override = (
    kind: "chargeOverrides" | "budgetOverrides",
    key: string,
    value?: InflationRate,
  ) => {
    const values = { ...inflation[kind] };
    if (value) values[key] = value;
    else delete values[key];
    set({ [kind]: values });
  };
  const row = (
    kind: "chargeOverrides" | "budgetOverrides",
    key: string,
    label: string,
  ) => {
    const custom = inflation[kind]?.[key];
    const effective = custom ?? inflation;
    const path = `inflation.${kind}.${key}`;
    return (
      <div className="inflation-override" key={key}>
        <Toggle
          label={label}
          hint={custom ? "Custom inflation" : "Uses default inflation"}
          value={Boolean(custom)}
          onChange={(enabled) =>
            override(
              kind,
              key,
              enabled
                ? { rate: inflation.rate, period: inflation.period }
                : undefined,
            )
          }
        />
        {custom && (
          <div className="form-grid">
            <Field
              label={`${label} inflation rate · %`}
              type="number"
              min={-50}
              max={100}
              step="any"
              value={effective.rate}
              path={`${path}.rate`}
              onChange={(rate) => override(kind, key, { ...effective, rate })}
            />
            <Field
              label={`${label} inflation period`}
              value={effective.period}
              options={periods}
              path={`${path}.period`}
              onChange={(period) =>
                override(kind, key, { ...effective, period })
              }
            />
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="inflation-settings">
      <h4>Inflation</h4>
      <div className="form-grid">
        <Field
          label="Default inflation rate · %"
          type="number"
          value={inflation.rate}
          min={-50}
          max={100}
          step="any"
          path="inflation.rate"
          onChange={(rate) => set({ rate })}
          hint="Applies to every charge and budget unless overridden. Use 0% for constant prices."
        />
        <Field
          label="Inflation period"
          value={inflation.period}
          options={periods}
          path="inflation.period"
          onChange={(period) => set({ period })}
          hint="The rate is applied once per selected period and compounds over time."
        />
      </div>
      {inflation.period === "monthly" &&
        Number.isFinite(inflation.rate) &&
        inflation.rate !== 0 && (
          <p className="field-hint inflation-note">
            {inflation.rate}% monthly compounds to{" "}
            {((1 + inflation.rate / 100) ** 12 * 100 - 100).toLocaleString(
              "en-GB",
              { maximumFractionDigits: 2 },
            )}
            % over a full year.
          </p>
        )}
      <details className="source-details inflation-advanced">
        <summary>Advanced inflation settings</summary>
        <p className="field-hint inflation-note">
          Enable a custom rate for any charge or budget. A custom 0% rate keeps
          that amount constant. Turn it off to use the default again.
        </p>
        <details className="source-details">
          <summary>Charges ({config.charges.length})</summary>
          {config.charges.map((charge) =>
            row("chargeOverrides", charge.id, charge.name),
          )}
          {!config.charges.length && (
            <p className="muted">
              Add charges in the Charges tab to set individual rates.
            </p>
          )}
        </details>
        <details className="source-details">
          <summary>Budgets ({categories.length})</summary>
          {categories.map((category) =>
            row("budgetOverrides", category.key, categoryPath(category.key)),
          )}
        </details>
      </details>
    </div>
  );
}
