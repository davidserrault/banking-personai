import type { PersonaConfig } from "../domain/types";
import type {
  SpendingMode,
  SpendingModeKind,
  TriggerGroup,
  ModeTrigger,
} from "../domain/modes";
import {
  modeNames,
  modeDescriptions,
  newSpendingMode,
  triggerLabels,
  modeConditionOptions,
  newModeCondition,
  uniqueModeConditions,
} from "../config/modes";
import {
  spendingCategories as categories,
  categoryPath,
} from "../domain/categories";
import { CategoryField } from "./CategoryField";
import { Section, Field, Toggle, AddButton, DeleteButton } from "./controls";
import { categoryLabel } from "./messages";
import { newId } from "./format";
import { Plus, SlidersHorizontal } from "lucide-react";

export function Modes({
  config: c,
  update,
}: {
  config: PersonaConfig;
  update: (fn: (c: PersonaConfig) => void) => void;
}) {
  const modes = c.spendingModes ?? [];
  return (
    <>
      <Section
        title="Spending modes"
        description="Keep the underlying persona. Add a temporary strategy, choose when it applies, then explore its effect in the history."
      >
        <div className="mode-presets">
          {(Object.keys(modeNames) as SpendingModeKind[]).map((kind) => (
            <button
              className="mode-preset"
              key={kind}
              disabled={modes.length >= 30}
              onClick={() =>
                update((d) => {
                  (d.spendingModes ??= []).push(
                    newSpendingMode(kind, newId("mode"), d.startDate),
                  );
                })
              }
            >
              <span>
                <strong>{modeNames[kind]}</strong>
                <Plus size={16} />
              </span>
              <small>{modeDescriptions[kind]}</small>
            </button>
          ))}
        </div>
        <p className="field-hint">
          New modes last 30 days from the simulation start. Higher priority wins
          during an overlap; other modes keep their schedules. With no active
          mode, baseline behaviour applies.
        </p>
      </Section>
      {modes.map((m, index) => (
        <ModeEditor
          key={m.id}
          mode={m}
          index={index}
          currency={c.displayCurrency ?? c.currency}
          change={(fn) => update((d) => fn(d.spendingModes![index]))}
          remove={() =>
            update((d) => {
              d.spendingModes!.splice(index, 1);
            })
          }
        />
      ))}
    </>
  );
}
function ModeEditor({
  mode: m,
  index,
  currency,
  change,
  remove,
}: {
  mode: SpendingMode;
  index: number;
  currency: string;
  change: (fn: (m: SpendingMode) => void) => void;
  remove: () => void;
}) {
  const path = `spendingModes.${index}`;
  const conditional = m.activationTriggers.rules.length > 0;
  const num = (
    label: string,
    key:
      | "priority"
      | "intensity"
      | "cooldown"
      | "transitionDuration"
      | "liquidityTarget"
      | "randomness"
      | "planningDays",
    min: number,
    max: number,
    percent = false,
  ) => (
    <Field
      key={key}
      label={label}
      type="number"
      value={m[key] * (percent ? 100 : 1)}
      min={min}
      max={max}
      step={
        key === "intensity" || key === "randomness" || key === "liquidityTarget"
          ? "any"
          : 1
      }
      path={`${path}.${key}`}
      onChange={(v) =>
        change((d) => {
          d[key] = v / (percent ? 100 : 1);
        })
      }
    />
  );
  return (
    <Section
      className="mode-editor"
      title={m.label}
      description={modeDescriptions[m.kind]}
      action={
        <DeleteButton label={`Remove ${m.label} mode`} onClick={remove} />
      }
    >
      <Toggle
        label="Mode enabled"
        value={m.enabled && (m.active || conditional)}
        onChange={(v) =>
          change((d) => {
            d.enabled = v;
            d.active = v;
          })
        }
      />
      <div className="form-grid">
        <Field
          label="Mode name"
          value={m.label}
          path={`${path}.label`}
          onChange={(v) =>
            change((d) => {
              d.label = v;
            })
          }
        />
        {num("Intensity · %", "intensity", 0, 100, true)}
        <Field
          label="Activation"
          value={conditional ? "conditions" : "schedule"}
          options={[
            ["schedule", "On a schedule"],
            ["conditions", "When conditions match"],
          ]}
          onChange={(v) =>
            change((d) => {
              d.active = true;
              d.activationTriggers.rules =
                v === "conditions" ? [newModeCondition()] : [];
              if (v === "conditions") d.recurrence = "none";
            })
          }
        />
        <Field
          label={
            conditional ? "Monitor from · optional" : "Start date · optional"
          }
          type="date"
          value={m.startDate ?? ""}
          path={`${path}.startDate`}
          onChange={(v) =>
            change((d) => {
              if (v) d.startDate = v;
              else delete d.startDate;
            })
          }
        />
        <Field
          label="Duration · days"
          type="number"
          value={m.duration ?? 30}
          min={1}
          max={7300}
          step={1}
          path={`${path}.duration`}
          onChange={(v) =>
            change((d) => {
              d.duration = v;
              delete d.endDate;
            })
          }
        />
        {!conditional && (
          <Field
            label="Repeat schedule"
            value={m.recurrence}
            options={[
              ["none", "Once"],
              ["monthly", "Every month"],
              ["yearly", "Every year"],
            ]}
            onChange={(v) =>
              change((d) => {
                d.recurrence = v;
              })
            }
          />
        )}
      </div>
      <p className="field-hint">
        Duration counts calendar days from activation, including the first day.
        Without a start date, the simulation start is used.
      </p>
      {conditional && (
        <>
          <Triggers
            title="Activate when"
            group={m.activationTriggers}
            path={`${path}.activationTriggers`}
            change={(fn) =>
              change((d) => {
                fn(d.activationTriggers);
                // Removing the final condition must not silently start a scheduled mode.
                if (!d.activationTriggers.rules.length) d.enabled = false;
              })
            }
          />
          <p className="field-hint">
            Conditions are checked after daily income arrives. The mode can
            start again after its duration and cooldown if its conditions still
            match.
          </p>
        </>
      )}
      <details
        className="mode-details"
        open={m.deactivationTriggers.rules.length > 0 ? true : undefined}
      >
        <summary>
          Stop early · optional ({m.deactivationTriggers.rules.length})
        </summary>
        <Triggers
          title="Deactivate when"
          group={m.deactivationTriggers}
          path={`${path}.deactivationTriggers`}
          change={(fn) => change((d) => fn(d.deactivationTriggers))}
        />
        <p className="field-hint">
          Triggers are evaluated daily after income arrives, before spending.
          Spending triggers include purchases already posted this month.
          Historical income uses up to three completed simulation months, then
          the configured average as a fallback. Net wealth covers bank accounts
          minus outstanding loans.
        </p>
      </details>
      <details className="mode-details">
        <summary>Advanced timing & intensity</summary>
        <div className="form-grid">
          {num("Priority · higher wins", "priority", 0, 100)}
          {num("Cooldown before reactivation · days", "cooldown", 0, 7300)}
          {num("Transition · days", "transitionDuration", 0, 365)}
          {num("Behaviour variability · %", "randomness", 0, 100, true)}
        </div>
        <p className="field-hint">
          Higher priority wins overlaps. Transitions ease purchase changes in
          and out; funding permissions apply while the mode controls spending.
        </p>
      </details>
      <details className="mode-details">
        <summary>
          Purchase rules <SlidersHorizontal size={16} />
        </summary>
        <Toggle
          label="Prefer cheaper merchants"
          value={m.preferCheapMerchants}
          onChange={(v) =>
            change((d) => {
              d.preferCheapMerchants = v;
            })
          }
        />
        <p className="field-hint">
          1× keeps the baseline; 0 stops new purchases. Mandatory payments
          remain payable. Optional trips are checked before departure; trips
          already started keep their committed payments. Substitution redirects
          a share of the reduced budget to an alternative category.
        </p>
        <div className="mode-category-list">
          {categories
            .filter(
              (c) => !["taxes", "bankfees", "incidentfees"].includes(c.key),
            )
            .map((category) => {
              const rule = m.categoryRules[category.key] ?? {
                amount: 1,
                frequency: 1,
              };
              return (
                <div className="mode-category" key={category.key}>
                  <strong>{categoryPath(category.key)}</strong>
                  <div className="form-grid">
                    <Field
                      label="Purchase amount · ×"
                      type="number"
                      min={0}
                      max={5}
                      value={rule.amount}
                      onChange={(v) =>
                        change((d) => {
                          d.categoryRules[category.key] = {
                            ...rule,
                            amount: v,
                          };
                        })
                      }
                    />
                    <Field
                      label="Purchase frequency · ×"
                      type="number"
                      min={0}
                      max={5}
                      value={rule.frequency}
                      onChange={(v) =>
                        change((d) => {
                          d.categoryRules[category.key] = {
                            ...rule,
                            frequency: v,
                          };
                        })
                      }
                    />
                    <CategoryField
                      label="Cheaper alternative"
                      value={rule.substituteTo ?? ""}
                      scope="spending"
                      emptyLabel="None"
                      availableKeys={categories
                        .filter(
                          (c) =>
                            c.key !== category.key &&
                            c.parentId !== 159 &&
                            !["bankfees", "incidentfees"].includes(c.key),
                        )
                        .map((c) => c.key)}
                      onChange={(v) =>
                        change((d) => {
                          const r = (d.categoryRules[category.key] ??= {
                            ...rule,
                          });
                          if (v) {
                            r.substituteTo = v;
                            r.substitutionShare ??= 0.1;
                          } else {
                            delete r.substituteTo;
                            delete r.substitutionShare;
                          }
                        })
                      }
                    />
                    {rule.substituteTo && (
                      <Field
                        label="Redirect reduced budget · %"
                        type="number"
                        min={0}
                        max={100}
                        value={(rule.substitutionShare ?? 0) * 100}
                        onChange={(v) =>
                          change((d) => {
                            d.categoryRules[category.key].substitutionShare =
                              v / 100;
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </details>
      <details className="mode-details">
        <summary>Savings, investments & debt</summary>
        <div className="form-grid">
          {num(
            `Operational cash target · ${currency}`,
            "liquidityTarget",
            0,
            1e9,
          )}
          {num("Prepare upcoming events · days", "planningDays", 0, 365)}
          <Field
            label="Liquid savings · share of surplus %"
            type="number"
            min={0}
            max={100}
            value={m.savingsRules.contributionMultiplier * 100}
            onChange={(v) =>
              change((d) => {
                d.savingsRules.contributionMultiplier = v / 100;
              })
            }
          />
          <Field
            label="Investments · share of surplus %"
            type="number"
            min={0}
            max={100}
            value={m.investmentRules.contributionMultiplier * 100}
            onChange={(v) =>
              change((d) => {
                d.investmentRules.contributionMultiplier = v / 100;
              })
            }
          />
          <Field
            label="Savings withdrawals"
            value={m.savingsRules.withdrawals}
            options={[
              ["never", "Never"],
              ["essentials", "Essentials and mandatory payments only"],
              ["available", "Any permitted purchase"],
            ]}
            onChange={(v) =>
              change((d) => {
                d.savingsRules.withdrawals = v;
              })
            }
          />
          <Field
            label="Withdrawal allowance · % of accessible savings"
            type="number"
            min={0}
            max={100}
            value={m.savingsRules.withdrawalLimitPercent}
            onChange={(v) =>
              change((d) => {
                d.savingsRules.withdrawalLimitPercent = v;
              })
            }
          />
          <Field
            label="Allow eligible investment withdrawals after · days"
            type="number"
            min={1}
            max={7300}
            value={m.investmentRules.withdrawAfterDays ?? ""}
            hint="Leave blank to protect investments. Withdrawal allowances include savings at activation and new contributions. Accounts with withdrawal priority 0 are always excluded."
            onChange={(v) =>
              change((d) => {
                d.investmentRules.withdrawAfterDays = Number.isNaN(v)
                  ? null
                  : v;
              })
            }
          />
        </div>
        <Toggle
          label="Allow authorised overdraft"
          value={m.debtRules.allowOverdraft}
          onChange={(v) =>
            change((d) => {
              d.debtRules.allowOverdraft = v;
            })
          }
          hint="Uses the baseline overdraft limit. Mandatory payments can still cause an unavoidable negative balance."
        />
        <Toggle
          label="Allow new borrowing"
          value={m.debtRules.allowBorrowing}
          onChange={(v) =>
            change((d) => {
              d.debtRules.allowBorrowing = v;
            })
          }
          hint="Uses existing financing permissions and limits. Existing loan installments always remain due."
        />
      </details>
      {m.kind === "balanced" && (
        <details className="mode-details" open>
          <summary>Target allocation</summary>
          <div className="form-grid">
            {(["needs", "wants", "future"] as const).map((key) => (
              <Field
                key={key}
                label={`${{ needs: "Needs", wants: "Wants", future: "Savings, investment & debt repayment" }[key]} · %`}
                type="number"
                min={0}
                max={100}
                value={m.allocation[key]}
                onChange={(v) =>
                  change((d) => {
                    d.allocation[key] = v;
                  })
                }
              />
            ))}
          </div>
          <p className="field-hint">
            Targets must total 100%. Essentials stay at their normal level. If
            obligations exceed the needs target, wants and future contributions
            adjust to the remaining income.
          </p>
        </details>
      )}
    </Section>
  );
}
function Triggers({
  title,
  group,
  path,
  change,
}: {
  title: string;
  group: TriggerGroup;
  path: string;
  change: (fn: (g: TriggerGroup) => void) => void;
}) {
  return (
    <div className="mode-trigger-group">
      <div className="section-heading">
        <h4>{title}</h4>
        <AddButton
          disabled={group.rules.length >= 20}
          onClick={() =>
            change((g) => {
              const metric =
                modeConditionOptions.find(
                  ([key]) => !g.rules.some((r) => r.metric === key),
                )?.[0] ?? "checkingBalance";
              g.rules = uniqueModeConditions([
                ...g.rules,
                newModeCondition(metric),
              ]);
            })
          }
        >
          Add condition
        </AddButton>
      </div>
      {group.rules.length > 1 && (
        <Field
          label={`${title} · match`}
          value={group.match}
          options={[
            ["all", "All conditions"],
            ["any", "Any condition"],
          ]}
          onChange={(v) =>
            change((g) => {
              g.match = v;
            })
          }
        />
      )}
      {group.rules.map((r, i) => {
        const p = `${path}.rules.${i}`;
        const patch = (value: Partial<ModeTrigger>) =>
          change((g) => {
            Object.assign(g.rules[i], value);
            g.rules = uniqueModeConditions(g.rules);
          });
        const dated = ["date", "dateRange"].includes(r.metric);
        return (
          <div className="mode-trigger" key={i}>
            <div className="form-grid">
              <Field
                label="Condition"
                value={r.metric}
                options={
                  modeConditionOptions.some(([key]) => key === r.metric)
                    ? modeConditionOptions
                    : [
                        [r.metric, triggerLabels[r.metric]],
                        ...modeConditionOptions,
                      ]
                }
                onChange={(v) =>
                  change((g) => {
                    g.rules[i] = newModeCondition(v);
                    g.rules = uniqueModeConditions(g.rules);
                  })
                }
              />
              {dated ? (
                <>
                  <Field
                    label="Trigger date"
                    type="date"
                    value={r.date ?? ""}
                    path={`${p}.date`}
                    onChange={(v) => patch({ date: v })}
                  />
                  {r.metric === "dateRange" && (
                    <Field
                      label="Until date"
                      type="date"
                      value={r.endDate ?? ""}
                      path={`${p}.endDate`}
                      onChange={(v) => patch({ endDate: v })}
                    />
                  )}
                </>
              ) : (
                <>
                  <Field
                    label="Comparison"
                    value={r.operator}
                    options={[
                      ["lt", "Less than"],
                      ["lte", "At most"],
                      ["gt", "More than"],
                      ["gte", "At least"],
                      ["eq", "Equal to"],
                    ]}
                    onChange={(v) => patch({ operator: v })}
                  />
                  <Field
                    label="Threshold"
                    type="number"
                    value={r.value}
                    path={`${p}.value`}
                    onChange={(v) => patch({ value: v })}
                  />
                </>
              )}
              {r.metric === "categorySpending" && (
                <CategoryField
                  label="Category"
                  value={r.category ?? ""}
                  path={`${p}.category`}
                  scope="spending"
                  emptyLabel="Select category"
                  onChange={(v) => patch({ category: v })}
                />
              )}
            </div>
            {[
              "unexpectedIncome",
              "bonusReceived",
              "refundReceived",
              "incomeReceived",
            ].includes(r.metric) && (
              <div className="form-grid">
                {(
                  [
                    [
                      "incomeKind",
                      "Income type",
                      ["any", "salary", "bonus", "refund", "other"],
                    ],
                    [
                      "incomeExpected",
                      "Expectation",
                      ["any", "expected", "unexpected"],
                    ],
                    [
                      "incomeCadence",
                      "Recurrence",
                      ["any", "recurring", "exceptional"],
                    ],
                    [
                      "incomeChange",
                      "Change duration",
                      ["any", "temporary", "persistent"],
                    ],
                  ] as const
                )
                  .filter(
                    ([key]) =>
                      !(
                        key === "incomeKind" &&
                        ["bonusReceived", "refundReceived"].includes(
                          r.metric,
                        ) &&
                        (!r[key] || r[key] === "any")
                      ) &&
                      !(
                        key === "incomeExpected" &&
                        r.metric === "unexpectedIncome" &&
                        (!r[key] || r[key] === "any")
                      ),
                  )
                  .map(([key, label, values]) => (
                    <Field
                      key={key}
                      label={label}
                      value={r[key] ?? "any"}
                      options={values.map((v) => [
                        v,
                        v[0].toUpperCase() + v.slice(1),
                      ])}
                      onChange={(v) => patch({ [key]: v })}
                    />
                  ))}
              </div>
            )}
            <DeleteButton
              label={`Remove ${title.toLowerCase()} condition ${i + 1}`}
              onClick={() =>
                change((g) => {
                  g.rules.splice(i, 1);
                })
              }
            />
          </div>
        );
      })}
      {!group.rules.length && (
        <p className="field-hint">
          {title === "Activate when"
            ? "No conditions: activation follows the schedule."
            : "No trigger: the mode ends after its duration."}
        </p>
      )}
    </div>
  );
}
