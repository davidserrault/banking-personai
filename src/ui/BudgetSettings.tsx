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
import {
  spendingCategories as categories,
  categoryGroups,
} from "../domain/categories";

export function BudgetSettings({
  file,
  onApply,
}: {
  file: ConfigurationFile;
  onApply: (patch: ReferenceDraft) => void;
}) {
  const [edit, setEdit] = useState<ReferenceEdit>();
  const [revision, setRevision] = useState(0);
  const [showAll, setShowAll] = useState(false);
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
        <label className="toggle-row">
          <span>Show all spending subcategories</span>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
        </label>
        {categoryGroups.map((group) => {
          const active = categories.filter(
            (cat) =>
              cat.parentId === group.id &&
              cat.parentId !== 159 &&
              c.budgetOverrides?.[cat.key] !== 0 &&
              (showAll || (budgets[cat.key] ?? 0) > 0),
          );
          const groupTotal = active.reduce(
            (sum, cat) => sum + (budgets[cat.key] ?? 0),
            0,
          );
          return active.length ? (
            <details
              className="budget-category-group"
              key={group.id}
              open={groupTotal > 0}
            >
              <summary>
                <span>{group.name}</span>
                <span>{money(groupTotal, c)} / month</span>
              </summary>
              <div className="budget-list">
                {active.map((cat) => (
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
            </details>
          ) : null;
        })}
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
