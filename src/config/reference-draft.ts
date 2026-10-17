import type { ConfigurationFile } from "../domain/types";
export interface ReferenceDraft {
  region?: string;
  costOfLiving?: number;
  style?: string;
  budgets?: Record<string, number>;
  budgetOverrides?: Record<string, number | undefined>;
  merchantOverrides?: Record<
    string,
    { mean?: number; frequency?: number } | undefined
  >;
  reference?: ConfigurationFile["reference"];
}
export function mergeReference(
  file: ConfigurationFile,
  draft: ReferenceDraft,
): ConfigurationFile {
  const configuration = structuredClone(file.configuration);
  if (draft.costOfLiving !== undefined)
    configuration.costOfLiving = draft.costOfLiving;
  if (draft.region !== undefined) configuration.region = draft.region;
  if (draft.style !== undefined) configuration.style = draft.style;
  if (draft.budgets) Object.assign(configuration.budgets, draft.budgets);
  if (draft.budgetOverrides)
    for (const [key, value] of Object.entries(draft.budgetOverrides)) {
      if (value === undefined) delete configuration.budgetOverrides?.[key];
      else (configuration.budgetOverrides ??= {})[key] = value;
    }
  if (draft.merchantOverrides)
    for (const [key, value] of Object.entries(draft.merchantOverrides)) {
      if (value === undefined) delete configuration.merchantOverrides?.[key];
      else (configuration.merchantOverrides ??= {})[key] = value;
    }
  return {
    ...file,
    configuration,
    reference: draft.reference ?? file.reference,
  };
}
