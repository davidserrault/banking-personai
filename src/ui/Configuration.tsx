import { CategoryField } from "./CategoryField";
import {
  expenseCategories as bridgeExpenses,
  categoryPath,
} from "../domain/categories";
import { Modes } from "./Modes";
import { Taxes } from "./Taxes";
import { useState } from "react";
import { Seasonality } from "./Seasonality";
import { DataContext } from "./DataContext";
import { BudgetSettings } from "./BudgetSettings";
import { CreditFacilities } from "./CreditFacilities";
import { PaymentCards } from "./PaymentCards";
import { AccountTransfers } from "./AccountTransfers";
import type { ReferenceDraft } from "../config/reference-draft";
import {
  CalendarDays,
  Copy,
  Shuffle,
  Wallet,
  ArrowDown,
  ArrowUp,
  Plus,
} from "lucide-react";
import type {
  ConfigurationFile,
  PersonaConfig,
  Account,
  Income,
  PlannedEvent,
} from "../domain/types";
import {
  Field,
  Section,
  Toggle,
  AddButton,
  DeleteButton,
  Empty,
} from "./controls";
import { t, messages, options, enumLabel, categoryLabel } from "./messages";
import { money, monthlyIncome, newId, dateLabel, endDate } from "./format";
import { spendingCategories as categories } from "../domain/categories";
import eventTemplates from "../../specifications/reference/event-templates.json";
import destinations from "../../specifications/reference/travel-destinations.json";
import products from "../../specifications/reference/savings-products.json";
import { countries, destinationCountries } from "../config/registry";
export type ConfigTab =
  | "profile"
  | "accounts"
  | "charges"
  | "behavior"
  | "events"
  | "modes"
  | "horizon";
interface Props {
  file: ConfigurationFile;
  tab: ConfigTab;
  update: (fn: (c: PersonaConfig) => void) => void;
  onReferenceChange: (patch: ReferenceDraft) => void;
}
const numberField = (
  label: string,
  value: number,
  onChange: (v: number) => void,
  path: string,
  min = 0,
  max = 1000000,
  step: number | string = "any",
) => (
  <Field
    key={path}
    label={label}
    type="number"
    value={value}
    onChange={onChange}
    path={path}
    min={min}
    max={max}
    step={step}
  />
);
export function Configuration({ file, tab, update, onReferenceChange }: Props) {
  const c = file.configuration;
  const set = <K extends keyof PersonaConfig>(
    key: K,
    value: PersonaConfig[K],
  ) =>
    update((d) => {
      d[key] = value;
    });
  const select = (
    key: keyof PersonaConfig,
    label: string,
    opts: [string, string][],
  ) => (
    <Field
      key={key}
      label={label}
      value={String(c[key])}
      onChange={(v) => {
        if (key === "housing") {
          update((d) => {
            d.housing = v;
            const housing = d.charges.find((x) => x.id === "housing");
            if (housing) {
              housing.enabled = ["rent", "mortgage"].includes(v);
              if (housing.enabled)
                housing.name = t(
                  v === "rent" ? "studio.rent" : "studio.mortgagePayment",
                );
            }
            const borrower = d.charges.find((x) => x.id === "borrower");
            if (borrower) borrower.enabled = v === "mortgage";
          });
        } else set(key, v);
      }}
      options={opts}
      path={key}
    />
  );
  if (tab === "profile")
    return (
      <>
        <Section title={t("studio.identity")}>
          <div className="form-grid">
            <Field
              label={t("profile.name")}
              value={c.name}
              path="name"
              onChange={(v) => set("name", v)}
            />
            <Field
              label={t("profile.id")}
              value={c.id}
              path="id"
              onChange={(v) => set("id", v)}
            />
            {numberField(
              t("profile.age"),
              c.age,
              (v) => set("age", v),
              "age",
              18,
              100,
              1,
            )}
            {numberField(
              t("profile.household"),
              c.household,
              (v) => set("household", v),
              "household",
              1,
              12,
              1,
            )}
            {numberField(
              t("profile.children"),
              c.children,
              (v) => set("children", v),
              "children",
              0,
              c.household - 1,
              1,
            )}
          </div>
        </Section>
        <DataContext
          file={file}
          onChange={(patch) => update((d) => Object.assign(d, patch))}
        />
        <Section title={t("studio.location")}>
          <div className="form-grid">
            {select("housing", t("profile.housing"), options("housing"))}
            {select(
              "employment",
              t("profile.employment"),
              options("employment"),
            )}
            {select("autonomy", t("profile.autonomy"), options("autonomy"))}
          </div>
          <Toggle
            label={t("profile.car")}
            value={c.car}
            onChange={(v) => set("car", v)}
          />
        </Section>
        <Section
          title={t("incomes.title")}
          description={t("studio.frequencyNote")}
          action={
            <AddButton
              disabled={c.incomes.length >= 30}
              onClick={() =>
                update((d) =>
                  d.incomes.push({
                    id: newId("income"),
                    label: t("studio.genericIncome"),
                    amount: 500,
                    frequency: "monthly",
                    day: 28,
                    month: 1,
                    amountVariation: 0,
                    frequencyVariation: 0,
                    annualGrowth: 0,
                    main: d.incomes.length === 0,
                    enabled: true,
                  }),
                )
              }
            >
              {t("incomes.add")}
            </AddButton>
          }
        >
          {c.incomes.length === 0 && (
            <p className="muted">{t("studio.noIncome")}</p>
          )}
          {c.incomes.map((income, index) => (
            <IncomeCard
              key={income.id}
              income={income}
              index={index}
              currency={c.displayCurrency ?? c.currency}
              change={(patch) =>
                update((d) => {
                  Object.assign(d.incomes[index], patch);
                  for (const key of ["startDate", "endDate"] as const)
                    if (d.incomes[index][key] === undefined)
                      delete d.incomes[index][key];
                })
              }
              main={() =>
                update((d) =>
                  d.incomes.forEach((x, i) => (x.main = i === index)),
                )
              }
              remove={() =>
                update((d) => {
                  d.incomes.splice(index, 1);
                  if (d.incomes.length && !d.incomes.some((x) => x.main))
                    d.incomes[0].main = true;
                })
              }
            />
          ))}
          <div className="total-line">
            <span>{t("incomes.equivalent")}</span>
            <strong>{money(monthlyIncome(c), c)}</strong>
          </div>
        </Section>
      </>
    );
  if (tab === "accounts")
    return (
      <>
        <Section
          title={t("accounts.title")}
          action={
            <AddButton
              disabled={c.accounts.length >= 20}
              onClick={() =>
                update((d) =>
                  d.accounts.push({
                    key: newId("saving"),
                    name: t("studio.genericSavings"),
                    bank: "",
                    type: "savings",
                    openingBalance: 0,
                    product: "csl",
                    annualRate: 1,
                    ceiling: null,
                    interestMode: "fortnight",
                    withdrawalRank: d.accounts.length,
                    depositRank: d.accounts.length,
                  }),
                )
              }
            >
              {t("accounts.add")}
            </AddButton>
          }
        >
          {c.accounts.map((account, index) => (
            <AccountCard
              key={index}
              account={account}
              index={index}
              currency={c.displayCurrency ?? c.currency}
              change={(patch) =>
                update((d) => Object.assign(d.accounts[index], patch))
              }
              remove={() =>
                update((d) => {
                  d.accounts.splice(index, 1);
                })
              }
            />
          ))}
        </Section>
        <PaymentCards config={c} update={update} />
        <CreditFacilities config={c} update={update} />
        <AccountTransfers config={c} update={update} />
      </>
    );
  if (tab === "charges")
    return (
      <>
        <Taxes config={c} system={file.reference.taxSystem} update={update} />
        <Section
          title={t("charges.title")}
          action={
            <AddButton
              disabled={c.charges.length >= 100}
              onClick={() =>
                update((d) =>
                  d.charges.push({
                    id: newId("charge"),
                    name: t("studio.genericCharge"),
                    amount: 50,
                    day: 5,
                    categoryId: 276,
                    enabled: true,
                  }),
                )
              }
            >
              {t("charges.add")}
            </AddButton>
          }
        >
          {c.charges.map((charge, index) => (
            <div key={charge.id} className="editor-card charge-card">
              <div className="card-actions">
                <Toggle
                  label={charge.name || t("charges.label")}
                  value={charge.enabled}
                  onChange={(v) =>
                    update((d) => {
                      d.charges[index].enabled = v;
                    })
                  }
                />
                <DeleteButton
                  onClick={() =>
                    update((d) => {
                      if (d.inflation?.chargeOverrides)
                        delete d.inflation.chargeOverrides[d.charges[index].id];
                      d.charges.splice(index, 1);
                    })
                  }
                />
              </div>
              <div className="form-grid compact-grid">
                <Field
                  label={t("charges.label")}
                  value={charge.name}
                  path={`charges.${index}.name`}
                  onChange={(v) =>
                    update((d) => {
                      d.charges[index].name = v;
                    })
                  }
                />
                {numberField(
                  `${t("charges.amount")} · ${c.displayCurrency ?? c.currency}`,
                  charge.amount,
                  (v) =>
                    update((d) => {
                      d.charges[index].amount = v;
                    }),
                  `charges.${index}.amount`,
                )}
                {numberField(
                  t("charges.day"),
                  charge.day,
                  (v) =>
                    update((d) => {
                      d.charges[index].day = v;
                    }),
                  `charges.${index}.day`,
                  1,
                  31,
                  1,
                )}
                <CategoryField
                  label={t("studio.category")}
                  value={charge.categoryId}
                  numeric
                  scope="expense"
                  path={`charges.${index}.categoryId`}
                  onChange={(v) =>
                    update((d) => {
                      d.charges[index].categoryId = Number(v);
                    })
                  }
                />
              </div>
            </div>
          ))}
          <div className="total-line">
            <span>{t("charges.total")}</span>
            <strong>
              {money(
                c.charges
                  .filter((x) => x.enabled)
                  .reduce((sum, x) => sum + x.amount, 0),
                c,
              )}
            </strong>
          </div>
        </Section>
      </>
    );
  if (tab === "behavior")
    return (
      <>
        <BudgetSettings file={file} onApply={onReferenceChange} />
        <Section title={t("behavior.seasonality")}>
          <Toggle
            label={t("behavior.seasonalEnabled")}
            value={c.seasonality.enabled}
            onChange={(v) =>
              update((d) => {
                d.seasonality.enabled = v;
              })
            }
          />
          <div className="form-grid">
            {(["volumeStrength", "amountStrength"] as const).map((key, i) =>
              numberField(
                t(`behavior.${i ? "basket" : "volume"}`),
                c.seasonality[key],
                (v) =>
                  update((d) => {
                    d.seasonality[key] = v;
                  }),
                `seasonality.${key}`,
                0,
                2,
                0.1,
              ),
            )}
          </div>
          <Seasonality file={file} />
        </Section>
        <Section title={t("studio.spending")}>
          <div className="form-grid">
            {numberField(
              t("behavior.discretionary"),
              c.discretionary,
              (v) => set("discretionary", v),
              "discretionary",
              0,
              3,
              0.1,
            )}
            {numberField(
              t("behavior.aggression"),
              c.savingAggression,
              (v) => set("savingAggression", v),
              "savingAggression",
              0,
              1,
              0.05,
            )}
            {select(
              "lowBalance",
              t("behavior.lowBalance"),
              options("lowBalance"),
            )}
            {numberField(
              `${t("behavior.buffer")} · ${c.displayCurrency ?? c.currency}`,
              c.buffer,
              (v) => set("buffer", v),
              "buffer",
            )}
          </div>
          <Toggle
            label={t("behavior.autoSavings")}
            value={c.autoSavings}
            onChange={(v) => set("autoSavings", v)}
          />
          <Toggle
            label={t("behavior.overdraft")}
            value={c.overdraft}
            onChange={(v) => set("overdraft", v)}
          />
          {c.overdraft &&
            numberField(
              t("behavior.limit"),
              c.overdraftLimit,
              (v) => set("overdraftLimit", v),
              "overdraftLimit",
            )}
          <Toggle
            label={t("behavior.support")}
            value={c.autoTopup}
            onChange={(v) => set("autoTopup", v)}
          />
          {c.autoTopup && (
            <div className="form-grid">
              {numberField(
                t("behavior.supportThreshold"),
                c.topupThreshold,
                (v) => set("topupThreshold", v),
                "topupThreshold",
                -1000000,
              )}
              {numberField(
                t("behavior.supportAmount"),
                c.topupAmount,
                (v) => set("topupAmount", v),
                "topupAmount",
                0.01,
              )}
            </div>
          )}
        </Section>
        <Section
          title={t("studio.savings")}
          description={t("studio.prioritiesNote")}
        >
          <div className="priority-columns">
            {(["depositRank", "withdrawalRank"] as const).map((key) => (
              <div key={key}>
                <h4>
                  {t(
                    `accounts.${key === "depositRank" ? "depositPriority" : "withdrawalPriority"}`,
                  )}
                </h4>
                {c.accounts
                  .filter((x) => x.type !== "checking")
                  .sort(
                    (a, b) =>
                      (a[key] || 999) - (b[key] || 999) ||
                      a.key.localeCompare(b.key),
                  )
                  .map((a, index, list) => (
                    <div className="priority-row" key={a.key}>
                      <span>{a.name}</span>
                      <input
                        aria-label={`${t("studio.rank")} · ${a.name} · ${key === "depositRank" ? t("accounts.depositPriority") : t("accounts.withdrawalPriority")}`}
                        type="number"
                        min={0}
                        max={20}
                        value={a[key] ?? 0}
                        onChange={(e) =>
                          update((d) => {
                            d.accounts.find((x) => x.key === a.key)![key] =
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value);
                          })
                        }
                      />
                      <button
                        className="icon-button"
                        disabled={index === 0}
                        aria-label={`${t("actions.moveUp")} ${a.name}`}
                        onClick={() =>
                          update((d) => {
                            const prev = d.accounts.find(
                              (x) => x.key === list[index - 1].key,
                            )!;
                            const here = d.accounts.find(
                              (x) => x.key === a.key,
                            )!;
                            [prev[key], here[key]] = [here[key], prev[key]];
                          })
                        }
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={index === list.length - 1}
                        aria-label={`${t("actions.moveDown")} ${a.name}`}
                        onClick={() =>
                          update((d) => {
                            const next = d.accounts.find(
                              (x) => x.key === list[index + 1].key,
                            )!;
                            const here = d.accounts.find(
                              (x) => x.key === a.key,
                            )!;
                            [next[key], here[key]] = [here[key], next[key]];
                          })
                        }
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Section>
      </>
    );
  if (tab === "modes") return <Modes config={c} update={update} />;
  if (tab === "events") return <Events file={file} update={update} />;
  return (
    <Section title={t("horizon.years")} description={t("studio.seedNote")}>
      <div className="year-presets">
        {[1, 2, 4, 8].map((year) => (
          <button
            className={c.years === year ? "selected" : ""}
            key={year}
            onClick={() => set("years", year)}
          >
            {year}
            <span>{t("studio.years")}</span>
          </button>
        ))}
      </div>
      <div className="form-grid">
        {numberField(
          t("horizon.years"),
          c.years,
          (v) => set("years", v),
          "years",
          1,
          20,
          1,
        )}
        <Field
          label={t("horizon.start")}
          type="date"
          value={c.startDate}
          path="startDate"
          onChange={(v) => set("startDate", v)}
        />
        <Field
          label={t("horizon.seed")}
          value={c.seed}
          path="seed"
          onChange={(v) => set("seed", v)}
        />
        <button
          className="button secondary align-end"
          onClick={() =>
            set("seed", String(crypto.getRandomValues(new Uint32Array(1))[0]))
          }
        >
          <Shuffle size={16} />
          {t("horizon.randomize")}
        </button>
      </div>
      {/^\d{4}-\d{2}-\d{2}$/.test(c.startDate) && Number.isFinite(c.years) && (
        <div className="period-preview">
          <CalendarDays />
          <div>
            <span>{t("studio.period")}</span>
            <strong>
              {dateLabel(c.startDate)} — {dateLabel(endDate(c))}
            </strong>
          </div>
        </div>
      )}
    </Section>
  );
}
function IncomeCard({
  income: i,
  index,
  currency,
  change,
  main,
  remove,
}: {
  income: Income;
  index: number;
  currency: string;
  change: (patch: Partial<Income>) => void;
  main: () => void;
  remove: () => void;
}) {
  const path = `incomes.${index}`;
  return (
    <div className="editor-card">
      <div className="card-actions">
        <Toggle
          label={i.label || t("incomes.label")}
          value={i.enabled}
          onChange={(v) => change({ enabled: v })}
        />
        <label className="radio-label">
          <input
            type="radio"
            name="main-income"
            checked={i.main}
            onChange={main}
          />
          {t("incomes.main")}
        </label>
        <DeleteButton onClick={remove} />
      </div>
      <div className="form-grid">
        <Field
          label={t("incomes.label")}
          value={i.label}
          path={`${path}.label`}
          onChange={(v) => change({ label: v })}
        />
        <CategoryField
          label="Income category"
          scope="income"
          numeric
          value={
            i.categoryId ??
            (i.kind === "refund"
              ? 283
              : i.kind === "bonus"
                ? 233
                : i.main || i.kind === "salary"
                  ? 230
                  : 3)
          }
          path={`${path}.categoryId`}
          onChange={(v) => change({ categoryId: Number(v) })}
        />
        {numberField(
          `${t("incomes.amount")} · ${currency}`,
          i.amount,
          (v) => change({ amount: v }),
          `${path}.amount`,
        )}
        <Field
          label={t("incomes.frequency")}
          value={i.frequency}
          onChange={(v) =>
            change({
              frequency: v,
              day: ["weekly", "fortnightly"].includes(v)
                ? Math.min(i.day, 7)
                : i.day,
            })
          }
          options={Object.entries(messages.frequency)}
        />
        {!["daily", "once"].includes(i.frequency) &&
          numberField(
            t(
              `incomes.${["weekly", "fortnightly"].includes(i.frequency) ? "weekday" : "day"}`,
            ),
            i.day,
            (v) => change({ day: v }),
            `${path}.day`,
            1,
            ["weekly", "fortnightly"].includes(i.frequency) ? 7 : 31,
            1,
          )}
        {["quarterly", "semiannual", "annual"].includes(i.frequency) &&
          numberField(
            t("incomes.month"),
            i.month,
            (v) => change({ month: v }),
            `${path}.month`,
            1,
            12,
            1,
          )}
      </div>
      <details>
        <summary>Income classification & variation</summary>
        <div className="form-grid">
          <Field
            label="Income type"
            value={i.kind ?? (i.main ? "salary" : "other")}
            options={[
              ["salary", "Salary"],
              ["bonus", "Bonus"],
              ["refund", "Refund"],
              ["other", "Other"],
            ]}
            onChange={(v) => change({ kind: v })}
          />
          <Field
            label="Income recurrence"
            value={i.cadence ?? "recurring"}
            options={[
              ["recurring", "Recurring"],
              ["exceptional", "Exceptional"],
            ]}
            onChange={(v) => change({ cadence: v })}
          />
          <Field
            label="Change duration"
            value={i.change ?? "persistent"}
            options={[
              ["temporary", "Temporary"],
              ["persistent", "Persistent"],
            ]}
            onChange={(v) => change({ change: v })}
          />
          <Field
            label="Expected income"
            value={String(i.expected ?? true)}
            options={[
              ["true", "Expected"],
              ["false", "Unexpected"],
            ]}
            onChange={(v) => change({ expected: v === "true" })}
          />
          <Field
            label="Income start date (optional)"
            type="date"
            value={i.startDate ?? ""}
            path={`${path}.startDate`}
            onChange={(v) => change({ startDate: v || undefined })}
          />
          <Field
            label="Income end date (optional)"
            type="date"
            value={i.endDate ?? ""}
            path={`${path}.endDate`}
            onChange={(v) => change({ endDate: v || undefined })}
          />

          {(
            ["amountVariation", "frequencyVariation", "annualGrowth"] as const
          ).map((key, j) =>
            numberField(
              `${t(`incomes.${["amountVariation", "frequencyVariation", "growth"][j]}`)} · %`,
              i[key],
              (v) => change({ [key]: v }),
              `${path}.${key}`,
              key === "annualGrowth" ? -50 : 0,
              100,
            ),
          )}
        </div>
      </details>
    </div>
  );
}
function AccountCard({
  account: a,
  index,
  currency,
  change,
  remove,
}: {
  account: Account;
  index: number;
  currency: string;
  change: (patch: Partial<Account>) => void;
  remove: () => void;
}) {
  const path = `accounts.${index}`;
  return (
    <div className="editor-card">
      <div className="card-actions">
        <span className="account-icon">
          <Wallet size={17} />
        </span>
        <h4>{a.name}</h4>
        <span className="chip">{t(`accounts.${a.type}`)}</span>
        <DeleteButton disabled={a.type === "checking"} onClick={remove} />
      </div>
      <div className="form-grid">
        <Field
          label={t("accounts.name")}
          value={a.name}
          path={`${path}.name`}
          onChange={(v) => change({ name: v })}
        />
        <Field
          label={t("accounts.bank")}
          value={a.bank}
          path={`${path}.bank`}
          onChange={(v) => change({ bank: v })}
        />
        {numberField(
          `${t("accounts.opening")} · ${currency}`,
          a.openingBalance,
          (v) => change({ openingBalance: v }),
          `${path}.openingBalance`,
          a.type === "checking" ? -100000000 : 0,
          100000000,
        )}
        {a.type !== "checking" && (
          <Field
            label={t("studio.type")}
            value={a.type}
            onChange={(v) =>
              change({
                type: v,
                product: v === "investment" ? "life-euro" : "csl",
              })
            }
            options={["savings", "investment"].map((x) => [
              x,
              t(`accounts.${x}`),
            ])}
          />
        )}
      </div>
      {a.type !== "checking" && (
        <div className="form-grid">
          <Field
            label={t("accounts.product")}
            value={a.product ?? "csl"}
            onChange={(v) => {
              const p = products.find((x) => x.id === v);
              change({
                product: v,
                annualRate: p?.rate ?? a.annualRate,
                ceiling: p?.ceiling ?? null,
                type: (p?.type ?? a.type) as Account["type"],
              });
            }}
            options={products
              .filter((x) => x.type !== "checking")
              .map((x) => [x.id, enumLabel("products", x.id)])}
          />
          {numberField(
            `${t("accounts.rate")} · %`,
            a.annualRate ?? 0,
            (v) => change({ annualRate: v }),
            `${path}.annualRate`,
            0,
            30,
          )}
          <Field
            label={t("studio.interestMode")}
            value={a.interestMode ?? "fortnight"}
            onChange={(v) => change({ interestMode: v })}
            options={["fortnight", "daily"].map((x) => [x, t(`studio.${x}`)])}
          />
          <div>
            {a.ceiling !== null &&
              numberField(
                t("accounts.ceiling"),
                a.ceiling ?? 0,
                (v) => change({ ceiling: v }),
                `${path}.ceiling`,
              )}
            <Toggle
              label={t("studio.noCeiling")}
              value={a.ceiling === null}
              onChange={(v) => change({ ceiling: v ? null : 20000 })}
            />
          </div>
        </div>
      )}
      <details>
        <summary>{t("studio.showAdvanced")}</summary>
        <Field
          label={t("accounts.key")}
          value={a.key}
          path={`${path}.key`}
          onChange={(v) => change({ key: v })}
        />
      </details>
    </div>
  );
}
function Events({
  file,
  update,
}: {
  file: ConfigurationFile;
  update: Props["update"];
}) {
  const c = file.configuration;
  const [type, setType] = useState("travel-domestic");
  const create = () => {
    const template = structuredClone(
      eventTemplates.find((x) => x.type === type) ?? eventTemplates[0],
    ) as PlannedEvent;
    template.id = newId("event");
    template.label = enumLabel("eventTypes", type);
    template.startDate = c.startDate;
    template.recurrence = "once";
    template.travelers = Math.min(template.travelers, c.household);
    update((d) => d.plannedEvents.push(template));
  };
  return (
    <>
      <Section title={t("events.title")}>
        <div className="add-event">
          <Field
            label={t("events.type")}
            value={type}
            options={Object.entries(messages.eventTypes)}
            onChange={setType}
          />
          <AddButton disabled={c.plannedEvents.length >= 100} onClick={create}>
            {t("events.add")}
          </AddButton>
        </div>
        {!c.plannedEvents.length && (
          <Empty
            icon={<CalendarDays size={32} />}
            title={t("studio.noEvents")}
            text={t("studio.emptyEvents")}
          />
        )}
        {c.plannedEvents.map((e, index) => {
          const set = (patch: Partial<PlannedEvent>) =>
            update((d) => Object.assign(d.plannedEvents[index], patch));
          const change = (patch: Partial<PlannedEvent["change"]>) =>
            update((d) => Object.assign(d.plannedEvents[index].change, patch));
          const path = `plannedEvents.${index}`;
          const num = (
            key: keyof PlannedEvent,
            label: string,
            min = 0,
            max = 10000000,
          ) =>
            numberField(
              label,
              e[key] as number,
              (v) => set({ [key]: v }),
              `${path}.${key}`,
              min,
              max,
            );
          return (
            <div className="editor-card" key={e.id}>
              <div className="card-actions">
                <span className="step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Toggle
                  label={e.label}
                  value={e.enabled}
                  onChange={(v) => set({ enabled: v })}
                />
                <button
                  className="icon-button"
                  aria-label={t("studio.duplicate")}
                  onClick={() =>
                    update((d) =>
                      d.plannedEvents.push({
                        ...structuredClone(e),
                        id: newId("event"),
                      }),
                    )
                  }
                >
                  <Copy size={16} />
                </button>
                <DeleteButton
                  onClick={() =>
                    update((d) => {
                      d.plannedEvents.splice(index, 1);
                    })
                  }
                />
              </div>
              <div className="form-grid">
                <Field
                  label={t("events.label")}
                  value={e.label}
                  onChange={(v) => set({ label: v })}
                />
                <Field
                  label={t("events.type")}
                  value={e.type}
                  options={Object.entries(messages.eventTypes)}
                  onChange={(v) => {
                    const next = structuredClone(
                      eventTemplates.find((x) => x.type === v) ??
                        eventTemplates[0],
                    ) as PlannedEvent;
                    set({
                      ...next,
                      id: e.id,
                      startDate: e.startDate,
                      recurrence: e.recurrence ?? "once",
                      label: enumLabel("eventTypes", v),
                    });
                  }}
                />
                <Field
                  label={t("events.date")}
                  value={e.startDate}
                  path={`${path}.startDate`}
                  type="date"
                  onChange={(v) => set({ startDate: v })}
                />
                <Field
                  label="Repeat"
                  value={e.recurrence ?? "once"}
                  path={`${path}.recurrence`}
                  options={[
                    ["once", "Once"],
                    ["monthly", "Monthly"],
                    ["yearly", "Yearly"],
                  ]}
                  onChange={(v) => set({ recurrence: v })}
                  hint={
                    e.recurrence && e.recurrence !== "once"
                      ? "Repeats from the start date until the history ends. Short months use their last day. Each occurrence applies the event and any ongoing costs again."
                      : undefined
                  }
                />
                {[
                  "exceptional",
                  "car",
                  "property",
                  "travel-domestic",
                  "travel-abroad",
                ].includes(e.type) && (
                  <Toggle
                    label="Essential or committed expense"
                    value={e.mandatory ?? ["car", "property"].includes(e.type)}
                    onChange={(v) => set({ mandatory: v })}
                    hint="Spending modes may postpone optional purchases before they are committed."
                  />
                )}
                {["exceptional", "inheritance"].includes(e.type) && (
                  <Toggle
                    label={
                      e.type === "inheritance"
                        ? "Expected income"
                        : "Expected expense"
                    }
                    value={e.expected ?? false}
                    onChange={(v) => set({ expected: v })}
                    hint="Unexpected receipts and expenses can activate spending modes."
                  />
                )}
                {!["income-gap", "durable-change"].includes(e.type) &&
                  num(
                    "amount",
                    `${t("events.amount")} · ${e.type === "travel-abroad" ? destinations.find((x) => x.id === e.destination)?.currency : c.currency}`,
                  )}
                {["travel-domestic", "travel-abroad", "income-gap"].includes(
                  e.type,
                ) &&
                  num(
                    "durationDays",
                    t("events.duration"),
                    1,
                    e.type === "income-gap" ? 3650 : 90,
                  )}
                {e.type.startsWith("travel-") && (
                  <>
                    {num("travelers", t("events.travelers"), 1, c.household)}
                    <Field
                      label={t("events.destination")}
                      value={e.destination}
                      options={destinations
                        .filter((x) =>
                          e.type === "travel-domestic"
                            ? x.currency === c.currency
                            : x.currency !== c.currency,
                        )
                        .map((x) => [
                          x.id,
                          countries.find(
                            (y) => y.code === destinationCountries[x.id],
                          )?.name ?? x.id,
                        ])}
                      onChange={(v) => {
                        const dest = destinations.find((x) => x.id === v)!;
                        set({
                          destination: v,
                          exchangeRate:
                            dest.currency === c.currency ? 1 : dest.rate,
                          fxFeePercent: dest.currency === c.currency ? 0 : 2,
                        });
                      }}
                    />
                    {e.type === "travel-abroad" && (
                      <>
                        {num("exchangeRate", t("events.fx"), 0.000001)}
                        {num("fxFeePercent", `${t("events.fee")} · %`, 0, 100)}
                      </>
                    )}
                  </>
                )}
                {e.type === "income-gap" && (
                  <>
                    {num(
                      "incomeRemainingPercent",
                      `${t("events.retained")} · %`,
                      0,
                      100,
                    )}
                    <Field
                      label={t("events.scope")}
                      value={e.incomeScope}
                      options={["main", "all"].map((x) => [
                        x,
                        x === "main" ? t("incomes.main") : t("accounts.all"),
                      ])}
                      onChange={(v) => set({ incomeScope: v })}
                    />
                  </>
                )}
                {e.type === "exceptional" && (
                  <CategoryField
                    label={t("studio.category")}
                    value={e.category}
                    scope="expense"
                    onChange={(v) => set({ category: v })}
                  />
                )}
                {["property", "car"].includes(e.type) && (
                  <>
                    {num("extraCosts", t("events.extraCosts"))}
                    {num("monthlyImpact", t("events.monthlyImpact"))}
                  </>
                )}
              </div>
              {e.type === "property" && (
                <>
                  <Toggle
                    label={t("events.replaceHousing")}
                    value={e.replaceHousingCharge}
                    onChange={(v) => set({ replaceHousingCharge: v })}
                  />
                  <Toggle
                    label={t("financing.mortgage")}
                    value={e.mortgageEnabled}
                    onChange={(v) => set({ mortgageEnabled: v })}
                  />
                  {e.mortgageEnabled && (
                    <div className="form-grid">
                      {num(
                        "mortgagePrincipal",
                        t("financing.principal"),
                        0,
                        e.amount + e.extraCosts,
                      )}
                      {num("mortgageRate", t("financing.rate"), 0, 50)}
                      {num("mortgageMonths", t("financing.term"), 1, 480)}
                      {num("mortgageInsurance", t("financing.insurance"))}
                    </div>
                  )}
                </>
              )}
              {e.type === "durable-change" && (
                <div className="form-grid">
                  <Field
                    label={t("events.type")}
                    value={e.change.kind}
                    options={["salary", "rent", "category-prices", "birth"].map(
                      (x) => [x, t(`durable.${x}`)],
                    )}
                    onChange={(v) => change({ kind: v })}
                  />
                  {e.change.kind === "salary" &&
                    numberField(
                      t("durable.targetIncome"),
                      e.change.salary,
                      (v) => change({ salary: v }),
                      `${path}.change.salary`,
                    )}
                  {e.change.kind === "rent" && (
                    <>
                      <Field
                        label={t("durable.targetCharge")}
                        value={e.change.chargeId}
                        options={c.charges
                          .filter((x) => x.enabled)
                          .map((x) => [x.id, x.name])}
                        onChange={(v) => change({ chargeId: v })}
                      />
                      {numberField(
                        t("durable.newCharge"),
                        e.change.rent,
                        (v) => change({ rent: v }),
                        `${path}.change.rent`,
                      )}
                    </>
                  )}
                  {e.change.kind === "category-prices" && (
                    <>
                      {numberField(
                        `${t("durable.pricePercent")} · %`,
                        e.change.priceChangePercent,
                        (v) => change({ priceChangePercent: v }),
                        `${path}.change.priceChangePercent`,
                        -90,
                        500,
                      )}
                      <div className="span-2 category-checks">
                        {categories.map((cat) => (
                          <label key={cat.key}>
                            <input
                              type="checkbox"
                              checked={e.change.categories.includes(cat.key)}
                              onChange={(ev) =>
                                change({
                                  categories: ev.target.checked
                                    ? [...e.change.categories, cat.key]
                                    : e.change.categories.filter(
                                        (x) => x !== cat.key,
                                      ),
                                })
                              }
                            />
                            {categoryPath(cat.key)}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {e.change.kind === "birth" &&
                    (
                      [
                        "childrenAdded",
                        "birthCost",
                        "childMonthlyCost",
                      ] as const
                    ).map((key, i) =>
                      numberField(
                        t(
                          `durable.${["addedChildren", "birthCost", "monthlyChildCost"][i]}`,
                        ),
                        e.change[key],
                        (v) => change({ [key]: v }),
                        `${path}.change.${key}`,
                        key === "childrenAdded" ? 1 : 0,
                        key === "childrenAdded" ? 6 : 1000000,
                      ),
                    )}
                </div>
              )}
            </div>
          );
        })}
      </Section>
      <Section
        title={t("financing.title")}
        description={t("studio.financingNote")}
      >
        <div className="form-grid">
          <Field
            label={t("financing.scope")}
            value={c.financing.scope}
            options={["events", "all"].map((x) => [
              x,
              t(`financing.${x === "events" ? "eventsOnly" : "all"}`),
            ])}
            onChange={(v) =>
              update((d) => {
                d.financing.scope = v;
              })
            }
          />
          <Field
            label={t("financing.priority")}
            value={c.financing.priority}
            options={["consumer", "card"].map((x) => [x, t(`financing.${x}`)])}
            onChange={(v) =>
              update((d) => {
                d.financing.priority = v;
              })
            }
          />
        </div>
        {(["consumer", "card"] as const).map((key) => (
          <div key={key}>
            <Toggle
              label={t(`financing.${key}`)}
              value={c.financing[`${key}Enabled`]}
              onChange={(v) =>
                update((d) => {
                  d.financing[`${key}Enabled`] = v;
                })
              }
            />
            {c.financing[`${key}Enabled`] && (
              <div className="form-grid">
                {(["Limit", "Rate", "Months", "Insurance"] as const).map(
                  (suffix, i) =>
                    numberField(
                      t(
                        `financing.${["limit", "rate", "term", "insurance"][i]}`,
                      ),
                      c.financing[`${key}${suffix}`],
                      (v) =>
                        update((d) => {
                          d.financing[`${key}${suffix}`] = v;
                        }),
                      `financing.${key}${suffix}`,
                      suffix === "Months" ? 1 : 0,
                      suffix === "Rate"
                        ? 50
                        : suffix === "Months"
                          ? key === "card"
                            ? 60
                            : 120
                          : 1000000,
                    ),
                )}
              </div>
            )}
          </div>
        ))}
      </Section>
    </>
  );
}
