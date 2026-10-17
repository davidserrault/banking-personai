import { useState } from "react";
import type { ConfigurationFile } from "../domain/types";
import { type ReferenceDraft } from "../config/reference-draft";
import {
  resetBudget,
  type ReferenceEdit,
} from "../config/reference-adjustments";
import { safeEnvelopes, money } from "./format";
import { Field, Section } from "./controls";
import { BudgetRow } from "./BudgetRows";
import { ReferenceAdjustment } from "./ReferenceAdjustment";
import { categoryLabel } from "./messages";
import categories from "../../specifications/reference/categories.json";

export function BudgetSettings({
  file,
  onApply,
}: {
  file: ConfigurationFile;
  onApply: (patch: ReferenceDraft) => void;
}) {
  const [edit, setEdit] = useState<ReferenceEdit>();
  const [revision, setRevision] = useState(0);
  const c = file.configuration;
  const budgets = safeEnvelopes(c, file.reference, file.assumptions);
  const total = Object.values(budgets).reduce((s, n) => s + n, 0);
  const removed = categories.filter(
    (cat) => cat.key !== "taxes" && c.budgetOverrides?.[cat.key] === 0,
  );
  const patch = (p: ReferenceDraft) => {
    onApply(p);
    setRevision((n) => n + 1);
  };
  const close = () => {
    setEdit(undefined);
    setRevision((n) => n + 1);
  };
  return (
    <>
      <Section
        title="Budget"
        description="Define your persona's monthly spending. Confirm an adjustment once to update the configuration and history."
        action={
          <strong className="budget-total">
            {money(total, c)} <small>/ month</small>
          </strong>
        }
      >
        <div className="budget-list">
          {categories
            .filter(
              (cat) =>
                cat.key !== "taxes" && c.budgetOverrides?.[cat.key] !== 0,
            )
            .map((cat) => (
              <BudgetRow
                key={cat.key}
                category={cat.key}
                amount={budgets[cat.key] ?? 0}
                total={total}
                config={c}
                revision={revision}
                onChange={(value) =>
                  setEdit({ kind: "budget", category: cat.key, value })
                }
                onReset={() => patch(resetBudget(file, cat.key))}
              />
            ))}
        </div>
        {!!removed.length && (
          <div className="restore-budgets">
            <Field
              label="Restore a budget"
              value=""
              options={[
                ["", "Choose a removed budget"],
                ...removed.map(
                  (cat) =>
                    [cat.key, categoryLabel(cat.key)] as [string, string],
                ),
              ]}
              onChange={(key) => key && patch(resetBudget(file, key))}
            />
          </div>
        )}
      </Section>
      {edit && (
        <ReferenceAdjustment
          file={file}
          edit={edit}
          onClose={close}
          onApply={(p) => {
            patch(p);
            close();
          }}
        />
      )}
    </>
  );
}
