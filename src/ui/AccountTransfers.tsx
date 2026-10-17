import type { AccountTransfer, PersonaConfig } from "../domain/types";
import { Section, Field, Toggle, AddButton, DeleteButton } from "./controls";
import { newId } from "./format";

export function AccountTransfers({
  config: c,
  update,
}: {
  config: PersonaConfig;
  update: (fn: (c: PersonaConfig) => void) => void;
}) {
  const rules = c.accountTransfers ?? [];
  const accounts: [string, string][] = c.accounts.map((a) => [a.key, a.name]);
  return (
    <Section
      title="Transfers between accounts"
      description="Move money between any two persona accounts, on a schedule or when a financial condition is met."
      action={
        <AddButton
          disabled={accounts.length < 2 || rules.length >= 100}
          onClick={() =>
            update((d) => {
              (d.accountTransfers ??= []).push({
                id: newId("transfer"),
                label: "Account transfer",
                enabled: true,
                fromAccount: d.accounts[0].key,
                toAccount: d.accounts[1].key,
                amount: 100,
                startDate: d.startDate,
                timing: "scheduled",
                recurrence: "monthly",
                trigger: {
                  kind: "balance-below",
                  account: d.accounts[0].key,
                  threshold: 500,
                  cooldownDays: 7,
                },
              });
            })
          }
        >
          Add transfer
        </AddButton>
      }
    >
      {accounts.length < 2 && (
        <p className="field-hint">Add a second account to set up transfers.</p>
      )}
      {!rules.length && <p className="muted">No transfers configured.</p>}
      {rules.map((r, i) => {
        const path = `accountTransfers.${i}`;
        const change = (fn: (r: AccountTransfer) => void) =>
          update((d) => fn(d.accountTransfers![i]));
        const currency = c.displayCurrency ?? c.currency;
        const average = r.trigger.kind.endsWith("above-average");
        const accountOptions = (value: string): [string, string][] =>
          accounts.some(([key]) => key === value)
            ? accounts
            : [[value, "Removed account — choose another"], ...accounts];
        return (
          <div className="editor-card" key={r.id}>
            <div className="card-actions">
              <Toggle
                label={r.label || "Account transfer"}
                value={r.enabled}
                onChange={(v) =>
                  change((d) => {
                    d.enabled = v;
                  })
                }
              />
              <DeleteButton
                label={`Remove ${r.label} transfer`}
                onClick={() =>
                  update((d) => {
                    d.accountTransfers!.splice(i, 1);
                  })
                }
              />
            </div>
            <div className="form-grid">
              <Field
                label="Transfer name"
                value={r.label}
                path={`${path}.label`}
                onChange={(v) =>
                  change((d) => {
                    d.label = v;
                  })
                }
              />
              <Field
                label={`Transfer amount · ${currency}`}
                type="number"
                min={10 ** -c.currencyDigits}
                value={r.amount}
                path={`${path}.amount`}
                onChange={(v) =>
                  change((d) => {
                    d.amount = v;
                  })
                }
              />
              <Field
                label="From account"
                value={r.fromAccount}
                path={`${path}.fromAccount`}
                options={accountOptions(r.fromAccount)}
                onChange={(v) =>
                  change((d) => {
                    const previousSource = d.fromAccount;
                    d.fromAccount = v;
                    if (d.toAccount === v) d.toAccount = previousSource;
                  })
                }
              />
              <Field
                label="To account"
                value={r.toAccount}
                path={`${path}.toAccount`}
                options={
                  r.toAccount === r.fromAccount
                    ? [
                        [r.toAccount, "Choose a different receiving account"],
                        ...accounts.filter(([key]) => key !== r.fromAccount),
                      ]
                    : accountOptions(r.toAccount).filter(
                        ([key]) => key !== r.fromAccount,
                      )
                }
                onChange={(v) =>
                  change((d) => {
                    d.toAccount = v;
                  })
                }
              />
              <Field
                label="Transfer timing"
                value={r.timing}
                options={[
                  ["scheduled", "On a schedule"],
                  ["triggered", "When a condition is met"],
                ]}
                onChange={(v) =>
                  change((d) => {
                    d.timing = v;
                  })
                }
              />
              <Field
                label={
                  r.timing === "scheduled"
                    ? "First transfer date"
                    : "Monitor from"
                }
                type="date"
                value={r.startDate}
                path={`${path}.startDate`}
                onChange={(v) =>
                  change((d) => {
                    d.startDate = v;
                  })
                }
              />
              {r.timing === "scheduled" && (
                <Field
                  label="Repeat transfer"
                  value={r.recurrence}
                  options={[
                    ["once", "Once"],
                    ["weekly", "Weekly"],
                    ["monthly", "Monthly"],
                    ["quarterly", "Quarterly"],
                    ["yearly", "Yearly"],
                  ]}
                  onChange={(v) =>
                    change((d) => {
                      d.recurrence = v;
                    })
                  }
                />
              )}
              <Field
                label="Stop after · optional"
                type="date"
                value={r.endDate ?? ""}
                path={`${path}.endDate`}
                onChange={(v) =>
                  change((d) => {
                    if (v) d.endDate = v;
                    else delete d.endDate;
                  })
                }
              />
            </div>
            {r.timing === "scheduled" && (
              <>
                <div className="form-grid">
                  <Field
                    label={`Minimum source balance before transfer · optional · ${currency}`}
                    type="number"
                    min={0}
                    max={1e8}
                    value={r.minimumSourceBalance ?? ""}
                    path={`${path}.minimumSourceBalance`}
                    onChange={(v) =>
                      change((d) => {
                        if (Number.isNaN(v)) delete d.minimumSourceBalance;
                        else d.minimumSourceBalance = v;
                      })
                    }
                  />
                </div>
                <p className="field-hint">
                  The source must always cover the full transfer amount. A
                  custom minimum is checked before the transfer, not the balance
                  left afterwards. If a condition is not met, this occurrence is
                  skipped and the next scheduled date is checked again.
                </p>
              </>
            )}
            {r.timing === "triggered" && (
              <>
                <div className="form-grid">
                  <Field
                    label="Transfer condition"
                    value={r.trigger.kind}
                    options={[
                      ["balance-below", "Account balance below an amount"],
                      ["balance-above", "Account balance above an amount"],
                      ["income-above-average", "Monthly income above average"],
                      [
                        "balance-above-average",
                        "Account balance above average",
                      ],
                    ]}
                    onChange={(v) =>
                      change((d) => {
                        d.trigger.kind = v;
                        d.trigger.threshold = v.endsWith("above-average")
                          ? 20
                          : 500;
                      })
                    }
                  />
                  {r.trigger.kind !== "income-above-average" && (
                    <Field
                      label="Account to monitor"
                      value={r.trigger.account}
                      options={accountOptions(r.trigger.account)}
                      path={`${path}.trigger.account`}
                      onChange={(v) =>
                        change((d) => {
                          d.trigger.account = v;
                        })
                      }
                    />
                  )}
                  <Field
                    label={
                      average
                        ? "Above average by · %"
                        : `Balance threshold · ${currency}`
                    }
                    type="number"
                    value={r.trigger.threshold}
                    min={average ? 0 : -1e8}
                    max={average ? 1000 : 1e8}
                    path={`${path}.trigger.threshold`}
                    onChange={(v) =>
                      change((d) => {
                        d.trigger.threshold = v;
                      })
                    }
                  />
                  <Field
                    label="Minimum days between condition activations"
                    type="number"
                    min={1}
                    max={7300}
                    step={1}
                    value={r.trigger.cooldownDays}
                    path={`${path}.trigger.cooldownDays`}
                    onChange={(v) =>
                      change((d) => {
                        d.trigger.cooldownDays = v;
                      })
                    }
                  />
                </div>
                <p className="field-hint">
                  One attempt when the condition becomes true. It must become
                  false before another attempt; the minimum interval also
                  applies. This interval does not repeat the transfer while the
                  condition stays true. For recurring transfers with a balance
                  condition, choose “On a schedule” and set a minimum source
                  balance.
                </p>
                {average && (
                  <p className="field-hint">
                    {r.trigger.kind === "balance-above-average"
                      ? "Balance averages use the previous 30 daily closing balances (opening balance initially)."
                      : "Income compares this month’s receipts with up to three complete prior months, using configured monthly income initially, and fires only on an income day."}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      {!!rules.length && (
        <p className="field-hint">
          Transfers run in list order after income arrives and before expenses.
          Financial triggers use the same balances before transfers. Only
          available funds move: no new borrowing or overdraft. The receiving
          account’s ceiling applies. Skipped transfers appear in History. These
          instructions are separate from automatic savings and Spending Modes.
        </p>
      )}
    </Section>
  );
}
