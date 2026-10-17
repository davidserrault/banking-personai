import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ConfigurationFile } from "../domain/types";
import {
  adjustReference,
  adjustmentTargets,
  categoryMetrics,
  type AdjustmentTarget,
  type ReferenceEdit,
} from "../config/reference-adjustments";
import { mergeReference, type ReferenceDraft } from "../config/reference-draft";
import { merchantRates } from "../engine/consumption";
import { categoryLabel, t } from "./messages";
import { money } from "./format";

export function ReferenceNumber({
  value,
  revision,
  label,
  min = 0,
  step,
  onCommit,
  disabled = false,
}: {
  value: number;
  revision: number;
  label: string;
  min?: number;
  step: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value, revision]);
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      step={step}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setText(String(value));
          e.currentTarget.value = String(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = Number(e.target.value);
        if (e.target.value === "" || !Number.isFinite(next) || next < min) {
          setText(String(value));
          return;
        }
        if (next !== value) onCommit(next);
      }}
    />
  );
}

export function ReferenceAdjustment({
  file,
  edit,
  onClose,
  onApply,
}: {
  file: ConfigurationFile;
  edit: ReferenceEdit;
  onClose: () => void;
  onApply: (patch: ReferenceDraft) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<AdjustmentTarget>(
    edit.kind === "budget" ? "frequency" : "budget",
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const rows = merchantRates(
    file.configuration,
    file.reference,
    file.assumptions,
  );
  const merchant =
    edit.kind === "budget"
      ? undefined
      : rows.find((r) => r.merchant.id === edit.merchantId);
  const category =
    edit.kind === "budget" ? edit.category : merchant!.merchant.category;
  const before = categoryMetrics(file, category);
  const choices = useMemo(
    () =>
      adjustmentTargets(edit).map((choice) => {
        try {
          const patch = adjustReference(file, edit, choice);
          const next = mergeReference(file, patch);
          return {
            choice,
            patch,
            metrics: categoryMetrics(next, category),
            rows: merchantRates(
              next.configuration,
              next.reference,
              next.assumptions,
            ),
            error: "",
          };
        } catch (e) {
          return { choice, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    [file, edit, category],
  );
  const selected = choices.find((c) => c.choice === target)!;
  const nextMerchant = selected.rows?.find(
    (r) => r.merchant.id === merchant?.merchant.id,
  );
  const metrics = [
    {
      label: "Category budget",
      before: money(before.budget, file.configuration),
      after: selected.metrics
        ? money(selected.metrics.budget, file.configuration)
        : "—",
    },
    {
      label: merchant
        ? "Average purchase"
        : "Average purchase across merchants",
      before: money(merchant?.mean ?? before.mean, file.configuration),
      after: selected.metrics
        ? money(nextMerchant?.mean ?? selected.metrics.mean, file.configuration)
        : "—",
    },
    {
      label: merchant ? "Purchases per month" : "Total purchases per month",
      before: (merchant?.frequency ?? before.frequency).toFixed(4),
      after: selected.metrics
        ? (nextMerchant?.frequency ?? selected.metrics.frequency).toFixed(4)
        : "—",
    },
  ];
  const label = (value: AdjustmentTarget) =>
    value === "both"
      ? "Both linked values"
      : value === "budget"
        ? "Category budget"
        : value === "mean"
          ? "Average purchase amount"
          : "Purchase frequency";
  return (
    <dialog
      ref={dialog}
      className="country-dialog adjustment-dialog"
      onCancel={onClose}
      aria-labelledby="adjustment-title"
    >
      <div className="dialog-header">
        <div>
          <h2 id="adjustment-title">What should change?</h2>
          <p>
            {merchant?.merchant.name ?? categoryLabel(category)} ·{" "}
            {edit.kind === "budget"
              ? "Budget"
              : edit.kind === "mean"
                ? "Average purchase"
                : "Monthly frequency"}
            :{" "}
            {edit.kind === "frequency"
              ? edit.value
              : money(edit.value, file.configuration)}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={t("actions.close")}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="dialog-body">
        <p>
          Choose which linked values to adjust. Confirm to update the
          configuration and recalculate the history.
        </p>
        <fieldset className="adjustment-options">
          <legend>Adjust</legend>
          {choices.map((choice) => (
            <label key={choice.choice}>
              <input
                type="radio"
                name="adjustment"
                value={choice.choice}
                checked={target === choice.choice}
                disabled={Boolean(choice.error)}
                onChange={() => setTarget(choice.choice)}
              />
              <span>
                {label(choice.choice)}
                {choice.error && <small>{choice.error}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <table className="adjustment-preview">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td>{m.before}</td>
                <td>{m.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="adjustment-note">
          Budget = average purchase × monthly frequency, summed across available
          merchants. “Both” shares the adjustment proportionally between the
          linked values. Amounts are rounded to the currency precision.
        </p>
        {selected.error && (
          <p className="field-error" role="alert">
            {selected.error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button className="button secondary" onClick={onClose}>
          {t("actions.cancel")}
        </button>
        <button
          className="button primary"
          disabled={!selected.patch}
          onClick={() => selected.patch && onApply(selected.patch)}
        >
          Confirm change
        </button>
      </div>
    </dialog>
  );
}
