import type { ConfigurationFile, PersonaConfig } from "../domain/types";
import { Field, Section } from "./controls";
import { messages } from "./messages";
import { InflationSettings } from "./InflationSettings";

export function DataContext({
  file,
  onChange,
}: {
  file: ConfigurationFile;
  onChange: (patch: Partial<PersonaConfig>) => void;
}) {
  const c = file.configuration;
  const currencies = Intl.supportedValuesOf("currency");
  return (
    <Section
      title="Location & spending context"
      description="Set purchase costs directly. Location is optional and does not affect calculations."
    >
      <div className="form-grid">
        <Field
          label="Location description · optional"
          value={c.locationDescription ?? ""}
          onChange={(locationDescription) => onChange({ locationDescription })}
        />
        <Field
          label="Display currency"
          value={c.displayCurrency ?? c.currency}
          options={currencies.map((code) => [code, code])}
          onChange={(displayCurrency) => onChange({ displayCurrency })}
          hint="Changes currency labels only. Amounts and exchange rates stay the same."
        />
        <Field
          label="Location-adjusted cost of living"
          type="number"
          value={c.costOfLiving ?? 1}
          min={0.1}
          max={10}
          step={0.05}
          path="costOfLiving"
          onChange={(costOfLiving) => onChange({ costOfLiving })}
          hint="1 = base costs. 1.2 raises all merchant purchase amounts and budgets by 20%, keeping purchase frequency unchanged."
        />
        <Field
          label="Consumption profile"
          value={c.style}
          options={Object.entries(messages.profiles)}
          onChange={(style) => onChange({ style })}
        />
      </div>
      <InflationSettings config={c} onChange={onChange} />
    </Section>
  );
}
