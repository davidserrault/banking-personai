import type { ConfigurationFile, Merchant } from "../domain/types";
import { merchantRates, monthlyEnvelopes } from "../engine/consumption";
import { exportConfiguration } from "./files";
import type { ReferenceDraft } from "./reference-draft";

export type ReferenceEdit =
  | { kind: "budget"; category: string; value: number }
  | { kind: "mean" | "frequency"; merchantId: number; value: number };
export type AdjustmentTarget = "budget" | "mean" | "frequency" | "both";

export function adjustmentTargets(edit: ReferenceEdit): AdjustmentTarget[] {
  return edit.kind === "budget"
    ? ["mean", "frequency", "both"]
    : edit.kind === "mean"
      ? ["budget", "frequency", "both"]
      : ["budget", "mean", "both"];
}

export function categoryMetrics(file: ConfigurationFile, category: string) {
  const rows = merchantRates(
    file.configuration,
    file.reference,
    file.assumptions,
  ).filter((r) => r.eligible && r.merchant.category === category);
  const frequency = rows.reduce((sum, r) => sum + r.frequency, 0);
  const spending = rows.reduce((sum, r) => sum + r.mean * r.frequency, 0);
  return {
    budget:
      monthlyEnvelopes(file.configuration, file.reference, file.assumptions)[
        category
      ] ?? 0,
    frequency,
    mean: frequency ? spending / frequency : 0,
    spending,
  };
}

/** Freeze the affected category's rates so automatic allocation cannot undo the user's choice. */
export function adjustReference(
  file: ConfigurationFile,
  edit: ReferenceEdit,
  target: AdjustmentTarget,
): ReferenceDraft {
  if (!adjustmentTargets(edit).includes(target))
    throw new Error("Choose a linked value to adjust.");
  if (
    !Number.isFinite(edit.value) ||
    edit.value < 0 ||
    (edit.kind === "mean" && edit.value === 0)
  )
    throw new Error(
      "Enter a valid positive amount, or zero for a budget or frequency.",
    );
  const c = structuredClone(file.configuration);
  const round = (n: number) =>
    Math.round(n * 10 ** c.currencyDigits) / 10 ** c.currencyDigits;
  if (edit.kind !== "frequency" && round(edit.value) !== edit.value)
    throw new Error(`Use at most ${c.currencyDigits} decimal places.`);
  const all = merchantRates(c, file.reference, file.assumptions);
  const selected =
    edit.kind === "budget"
      ? undefined
      : all.find((r) => r.merchant.id === edit.merchantId);
  const category =
    edit.kind === "budget" ? edit.category : selected?.merchant.category;
  if (!category) throw new Error("Choose an existing budget category.");
  if (selected && !selected.eligible)
    throw new Error("This merchant is unavailable for the selected profile.");
  const rows = all
    .filter((r) => r.eligible && r.merchant.category === category)
    .map((r) => ({ ...r }));
  const total = rows.reduce((s, r) => s + r.mean * r.frequency, 0);
  let budget =
    monthlyEnvelopes(c, file.reference, file.assumptions)[category] ?? 0;
  if (edit.kind === "budget") {
    budget = edit.value;
    if (!rows.length && budget > 0)
      throw new Error(
        "Add an available merchant to this category before setting a budget.",
      );
    if (budget === 0) {
      if (target === "mean" && total > 0)
        throw new Error(
          "Choose frequency to stop purchases; average purchase amounts must stay positive.",
        );
      rows.forEach((r) => {
        r.frequency = 0;
      });
    } else if (total === 0) {
      if (target === "mean")
        throw new Error(
          "Frequency must increase to restart purchases from a zero budget.",
        );
      const weight = rows.reduce((s, r) => s + r.weight, 0);
      rows.forEach((r) => {
        r.frequency = (budget * r.weight) / weight / r.mean;
      });
    } else {
      const ratio = budget / total;
      rows.forEach((r) => {
        if (target !== "frequency")
          r.mean = Math.max(
            10 ** -c.currencyDigits,
            round(r.mean * (target === "both" ? Math.sqrt(ratio) : ratio)),
          );
        if (target === "frequency") r.frequency *= ratio;
        if (target === "both") r.frequency *= Math.sqrt(ratio);
      });
      if (target === "both") {
        const roundedTotal = rows.reduce((s, r) => s + r.mean * r.frequency, 0);
        rows.forEach((r) => {
          r.frequency *= budget / roundedTotal;
        });
      }
    }
  } else {
    const row = rows.find((r) => r.merchant.id === edit.merchantId)!;
    const previous = row[edit.kind];
    const contribution = row.mean * row.frequency;
    row[edit.kind] = edit.value;
    const other = edit.kind === "mean" ? "frequency" : "mean";
    if (target !== "budget") {
      if (edit.value === 0 || previous === 0) {
        if (target !== "both")
          throw new Error(
            "A zero frequency requires the budget to change. Choose budget or both.",
          );
      } else if (target === "both") {
        row[other] *= Math.sqrt(previous / edit.value);
      } else {
        row[other] = contribution / edit.value;
      }
      if (other === "mean") row.mean = round(row.mean);
      if (row.mean <= 0)
        throw new Error(
          "Average purchases must stay positive. Choose budget instead.",
        );
    }
    if (target === "budget" || target === "both")
      budget = round(rows.reduce((s, r) => s + r.mean * r.frequency, 0));
  }
  const overrides = Object.fromEntries(
    rows.map((r) => [
      `${file.reference.id}|${c.style}|${r.merchant.id}`,
      { mean: round(r.mean / (c.costOfLiving ?? 1)), frequency: r.frequency },
    ]),
  );
  budget = round(budget / (c.costOfLiving ?? 1));
  c.budgetOverrides = { ...c.budgetOverrides, [category]: budget };
  c.merchantOverrides = { ...c.merchantOverrides, ...overrides };
  // Reuse the interchange validator for numeric limits and currency precision.
  exportConfiguration(c, file.reference, file.assumptions, file.modelId);
  return {
    budgetOverrides: { [category]: budget },
    merchantOverrides: overrides,
  };
}

export function combineReferenceDraft(
  draft: ReferenceDraft,
  patch: ReferenceDraft,
): ReferenceDraft {
  return {
    ...draft,
    ...patch,
    budgets: { ...draft.budgets, ...patch.budgets },
    budgetOverrides: { ...draft.budgetOverrides, ...patch.budgetOverrides },
    merchantOverrides: {
      ...draft.merchantOverrides,
      ...patch.merchantOverrides,
    },
  };
}

export function resetBudget(
  file: ConfigurationFile,
  category: string,
): ReferenceDraft {
  return {
    budgetOverrides: { [category]: undefined },
    merchantOverrides: Object.fromEntries(
      file.reference.merchants
        .filter((m) => m.category === category)
        .map((m) => [
          `${file.reference.id}|${file.configuration.style}|${m.id}`,
          undefined,
        ]),
    ),
  };
}

/** Adding or removing a merchant preserves other purchase patterns and adjusts the category total. */
export function editMerchantCatalog(
  file: ConfigurationFile,
  category: string,
  merchantId: number,
  addition?: { merchant: Merchant; frequency: number },
): ReferenceDraft {
  const next = structuredClone(file);
  delete next.reference.settings;
  next.reference.merchants = next.reference.merchants.filter(
    (m) => m.id !== merchantId,
  );
  if (addition) next.reference.merchants.push(addition.merchant);
  const overrides: NonNullable<ReferenceDraft["merchantOverrides"]> = {};
  for (const key of Object.keys(next.configuration.merchantOverrides ?? {})) {
    if (key.split("|")[2] === String(merchantId)) {
      overrides[key] = undefined;
      delete next.configuration.merchantOverrides![key];
    }
  }
  const rows = merchantRates(
    file.configuration,
    file.reference,
    file.assumptions,
  ).filter(
    (r) =>
      r.merchant.category === category &&
      r.merchant.id !== merchantId &&
      r.eligible,
  );
  for (const r of rows)
    overrides[
      `${file.reference.id}|${file.configuration.style}|${r.merchant.id}`
    ] = {
      mean:
        Math.round(
          (r.mean / (file.configuration.costOfLiving ?? 1)) *
            10 ** file.configuration.currencyDigits,
        ) /
        10 ** file.configuration.currencyDigits,
      frequency: r.frequency,
    };
  if (addition)
    overrides[
      `${file.reference.id}|${file.configuration.style}|${merchantId}`
    ] = { mean: addition.merchant.mean, frequency: addition.frequency };
  next.configuration.merchantOverrides ??= {};
  for (const [key, value] of Object.entries(overrides))
    if (value) next.configuration.merchantOverrides[key] = value;
  const metrics = categoryMetrics(next, category);
  const amount =
    Math.round(
      (metrics.spending / (next.configuration.costOfLiving ?? 1)) *
        10 ** next.configuration.currencyDigits,
    ) /
    10 ** next.configuration.currencyDigits;
  next.configuration.budgetOverrides = {
    ...next.configuration.budgetOverrides,
    [category]: amount,
  };
  exportConfiguration(
    next.configuration,
    next.reference,
    next.assumptions,
    next.modelId,
  );
  return {
    reference: next.reference,
    budgetOverrides: { [category]: amount },
    merchantOverrides: overrides,
  };
}
