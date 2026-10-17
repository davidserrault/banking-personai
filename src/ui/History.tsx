import { useMemo, useState } from "react";
import {
  Search,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import type { ConfigurationFile } from "../domain/types";
import type { SimulationResult, Transaction } from "../engine/types";
import { exportHistory } from "../config";
import { BalanceChart, Donut } from "./Charts";
import { combinedBalance, isAllAccounts } from "./balance-data";
import { Section, Field, Empty } from "./controls";
import { t, categoryLabel } from "./messages";
import { money, dateLabel, number, download } from "./format";
export const natureLabel = (kind: string): string =>
  ({
    income: t("studio.genericIncome"),
    tax: "Tax payment",
    inheritance: t("eventTypes.inheritance"),
    daily: t("studio.dailyPurchase"),
    recurring: t("studio.genericCharge"),
    habit: t("behavior.habits"),
    event: t("events.title"),
    travel: t("categories.travel"),
    transfer: t("studio.transfer"),
    support: t("behavior.support"),
    "savings-interest": t("history.interest"),
    "card-interest": "Credit card interest",
    "card-overdraft-interest": "Card overdraft interest",
    "credit-drawdown": t("history.principal"),
    "credit-repayment": t("studio.repayment"),
    "credit-insurance": t("studio.insurance"),
  })[kind] ?? kind;
export const operationCategory = (x: Transaction) =>
  x.category === "income"
    ? natureLabel(x.simulationKind)
    : categoryLabel(x.category);
export function History({
  result,
  file,
  account,
  onAccount,
  current,
  onExport,
}: {
  result?: SimulationResult;
  file: ConfigurationFile;
  account: string;
  onAccount: (key: string) => void;
  current: boolean;
  onExport: () => void;
}) {
  const c = file.configuration;
  const [period, setPeriod] = useState("all");
  const [periodValue, setPeriodValue] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const statementPreview = useMemo(() => {
    if (!showJson || !current || !result) return undefined;
    try {
      const statement = exportHistory(
        result,
        file,
        isAllAccounts(account) ? undefined : account,
      );
      return { ...statement, data: statement.data.slice(0, 1) };
    } catch {
      return undefined;
    }
  }, [showJson, current, result, file, account]);
  const reset = () => {
    setSearch("");
    setCategory("all");
    setFrom("");
    setTo("");
    setPage(0);
  };
  const periods = useMemo(
    () =>
      [
        ...new Set(
          result?.dailyBalances.map((x) =>
            x.date.slice(0, period === "year" ? 4 : 7),
          ) ?? [],
        ),
      ]
        .sort()
        .reverse(),
    [result, period],
  );
  const activePeriod =
    periodValue && periods.includes(periodValue) ? periodValue : periods[0];
  const summaryOps = useMemo(
    () =>
      result?.transactions.filter(
        (x) => period === "all" || x.date.startsWith(activePeriod),
      ) ?? [],
    [result, period, activePeriod],
  );
  const scale = 10 ** c.currencyDigits;
  const sum = (ops: Transaction[]) =>
    ops.reduce((s, x) => s + x.amountMinor, 0) / scale;
  const income = sum(
    summaryOps.filter(
      (x) =>
        x.amountMinor > 0 &&
        !["transfer", "credit-drawdown"].includes(x.simulationKind),
    ),
  );
  const expenses = -sum(
    summaryOps.filter(
      (x) => x.amountMinor < 0 && x.simulationKind !== "transfer",
    ),
  );
  const grouped = (positive: boolean) => {
    const group: Record<string, number> = {};
    summaryOps.forEach((x) => {
      if (
        x.simulationKind === "transfer" ||
        (positive && x.simulationKind === "credit-drawdown")
      )
        return;
      if (positive ? x.amountMinor > 0 : x.amountMinor < 0) {
        const label = positive
          ? x.incomeId
            ? (c.incomes.find((i) => i.id === x.incomeId)?.label ??
              natureLabel(x.simulationKind))
            : natureLabel(x.simulationKind)
          : operationCategory(x);
        group[label] = (group[label] ?? 0) + Math.abs(x.amountMinor);
      }
    });
    return Object.entries(group).map(([name, amount]) => ({
      name,
      amount: amount / scale,
    }));
  };
  const scoped =
    result?.transactions.filter(
      (x) => isAllAccounts(account) || x.accountKey === account,
    ) ?? [];
  const categoryOptions = [...new Set(scoped.map((x) => x.category))];
  const filtered = scoped.filter(
    (x) =>
      (!search ||
        `${x.label} ${natureLabel(x.simulationKind)}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (category === "all" || x.category === category) &&
      (!from || x.date.slice(0, 10) >= from) &&
      (!to || x.date.slice(0, 10) <= to),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const activePage = Math.min(page, pages - 1);
  if (!result)
    return (
      <Section title={t("history.title")}>
        <Empty
          icon={<CalendarDays size={32} />}
          title={t("studio.noHistory")}
          text={t("studio.noHistoryNote")}
        />
      </Section>
    );
  const days = result.dailyBalances.filter(
    (x) => period === "all" || x.date.startsWith(activePeriod),
  );
  const periodClosing = days.at(-1)?.checking ?? 0;
  const totalLedgerBalance = combinedBalance(
    result.accounts.map((account) => account.closingBalance),
    result.currencyDigits,
  );
  return (
    <>
      <div className="history-heading">
        <div>
          <span className="eyebrow">
            {c.name} /{" "}
            {c.locationDescription ? c.locationDescription + " / " : ""}{" "}
            {c.displayCurrency ?? c.currency}
          </span>
          <h2>{t("history.title")}</h2>
          <p>
            {dateLabel(result.startDate, true)} —{" "}
            {dateLabel(result.endDate, true)}{" "}
            <span>
              · {result.accounts.length} {t("accounts.title").toLowerCase()}
            </span>
          </p>
        </div>
        <button
          className="button primary"
          disabled={!current}
          onClick={onExport}
        >
          <Download size={16} />
          {t("actions.downloadHistory")}
        </button>
      </div>
      <div className="summary-toolbar">
        <h3>{t("history.summary")}</h3>
        <div className="period-controls">
          <Field
            label={t("studio.period")}
            value={period}
            options={["all", "year", "month"].map((x) => [
              x,
              t(`history.${x}`),
            ])}
            onChange={(v) => {
              setPeriod(v);
              setPeriodValue("");
            }}
          />
          {period !== "all" && (
            <Field
              label={t(`studio.${period === "year" ? "annual" : "month"}`)}
              value={activePeriod ?? ""}
              options={periods.map((x) => [
                x,
                period === "year"
                  ? x
                  : new Date(x + "-01T12:00:00Z").toLocaleDateString("en-GB", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }),
              ])}
              onChange={setPeriodValue}
            />
          )}
        </div>
      </div>
      <div className="metric-grid">
        <Metric
          label={t("history.operations")}
          value={number(summaryOps.length)}
        />
        <Metric label={t("history.income")} value={money(income, c)} />
        <Metric label={t("history.expenses")} value={money(expenses, c)} />
        <Metric
          label={t("history.balance")}
          value={money(periodClosing, c)}
          negative={periodClosing < 0}
          detail={`${days.filter((x) => x.checking < 0).length} ${t("history.overdraftDays").toLowerCase()}`}
        />
      </div>
      <div className="donut-panels">
        <Section title="">
          <Donut
            title={t("studio.expenseMix")}
            config={c}
            items={grouped(false)}
          />
        </Section>
        <Section title="">
          <Donut
            title={t("studio.incomeMix")}
            config={c}
            items={grouped(true)}
          />
        </Section>
      </div>
      <p className="footnote">
        {t("studio.summaryScope")} · {t("studio.incomeExclusion")}
      </p>
      <div className="banking-strip">
        <div>
          <span>{t("history.interest")}</span>
          <strong>{money(result.summary.interest, c)}</strong>
        </div>
        <div>
          <span>{t("history.accrued")}</span>
          <strong>
            {money(
              result.accounts.reduce((s, a) => s + a.accruedInterest, 0),
              c,
            )}
          </strong>
        </div>
      </div>
      <section className="panel history-chart-panel">
        <div
          className="account-tabs"
          role="tablist"
          aria-label={t("accounts.title")}
        >
          <button
            role="tab"
            aria-selected={account === "all"}
            className={account === "all" ? "selected" : ""}
            onClick={() => {
              onAccount("all");
              reset();
            }}
          >
            <span>All account balances</span>
            <strong className={totalLedgerBalance < 0 ? "negative" : ""}>
              {money(totalLedgerBalance, c)}
            </strong>
          </button>
          <button
            role="tab"
            aria-selected={account === "combined"}
            className={account === "combined" ? "selected" : ""}
            onClick={() => {
              onAccount("combined");
              reset();
            }}
          >
            <span>Combined balance</span>
            <strong className={totalLedgerBalance < 0 ? "negative" : ""}>
              {money(totalLedgerBalance, c)}
            </strong>
          </button>
          {result.accounts.map((a) => (
            <button
              key={a.key}
              role="tab"
              aria-selected={account === a.key}
              className={account === a.key ? "selected" : ""}
              onClick={() => {
                onAccount(a.key);
                reset();
              }}
            >
              <span>{a.name}</span>
              <strong className={a.closingBalance < 0 ? "negative" : ""}>
                {money(a.closingBalance, c)}
              </strong>
            </button>
          ))}
        </div>
        <div className="section-heading">
          <h3>{t("history.chart")}</h3>
          <span className="chip">
            {account === "all"
              ? "All account balances"
              : account === "combined"
                ? "Combined balance"
                : result.accounts.find((x) => x.key === account)?.name}
          </span>
        </div>
        <BalanceChart result={result} config={c} account={account} />
      </section>
      {(c.spendingModes?.length ?? 0) > 0 && (
        <Section
          title="Modes in the generated history"
          description="Dates below show the mode that actually controlled behaviour, after triggers and priorities were resolved."
        >
          {!result?.modeHistory.length ? (
            <p className="muted">
              No mode activated in this history. Check the dates and trigger
              conditions.
            </p>
          ) : (
            <div className="mode-timeline">
              {result.modeHistory.map((period, i) => (
                <div className="mode-period" key={`${period.modeId}-${i}`}>
                  <strong>{period.label}</strong>
                  <span>
                    {dateLabel(period.startDate, true)} –{" "}
                    {dateLabel(period.endDate, true)}
                  </span>
                  <small>{period.days} days</small>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
      <Section
        title={t("history.operations")}
        description={t("studio.tableScope")}
      >
        <div className="table-filters history-filters">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label={t("history.search")}
              placeholder={t("history.search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Field
            label={t("history.category")}
            value={category}
            options={[
              ["all", t("history.allCategories")],
              ...categoryOptions.map(
                (x) => [x, categoryLabel(x)] as [string, string],
              ),
            ]}
            onChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
          />
          <Field
            label={t("history.from")}
            type="date"
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPage(0);
            }}
          />
          <Field
            label={t("history.to")}
            type="date"
            value={to}
            onChange={(v) => {
              setTo(v);
              setPage(0);
            }}
          />
          <button className="text-button" onClick={reset}>
            {t("actions.clearFilters")}
          </button>
        </div>
        <div className="table-scroll">
          <table className="transactions-table">
            <thead>
              <tr>
                {[
                  "date",
                  "operation",
                  "category",
                  "account",
                  "amount",
                  "balanceAfter",
                ].map((key) => (
                  <th key={key}>{t(`history.${key}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(activePage * 30, activePage * 30 + 30)
                .map((x) => (
                  <tr key={x.id}>
                    <td>{dateLabel(x.date, true)}</td>
                    <td>
                      <div className="transaction-label">
                        <span className="transaction-icon">
                          {x.simulationKind === "transfer" ? (
                            <ArrowLeftRight size={16} />
                          ) : x.amount > 0 ? (
                            <ArrowDownLeft size={16} />
                          ) : (
                            <ArrowUpRight size={16} />
                          )}
                        </span>
                        <span>
                          <strong>{x.label}</strong>
                          <small>{natureLabel(x.simulationKind)}</small>
                          {x.fx && (
                            <small>
                              {x.fx.originalAmount} {x.fx.originalCurrency} · FX{" "}
                              {x.fx.exchangeRate} · {t("events.fee")}{" "}
                              {money(x.fx.fee, c)}
                            </small>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>{operationCategory(x)}</td>
                    <td>
                      {
                        result.accounts.find((a) => a.key === x.accountKey)
                          ?.name
                      }
                    </td>
                    <td className="numeric">
                      <strong>
                        {x.amount > 0 ? "+" : ""}
                        {money(x.amount, c)}
                      </strong>
                    </td>
                    <td
                      className={`numeric ${x.balanceAfter < 0 ? "negative" : ""}`}
                    >
                      {money(x.balanceAfter, c)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="empty">{t("history.noResults")}</p>
          )}
        </div>
        <div className="pagination">
          <span>
            {number(filtered.length)} {t("studio.transactions")} ·{" "}
            {t("studio.page")} {activePage + 1} {t("studio.of")} {pages}
          </span>
          <div>
            <button
              className="button secondary small"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={15} />
              {t("actions.previous")}
            </button>
            <button
              className="button secondary small"
              disabled={activePage >= pages - 1}
              onClick={() => setPage(activePage + 1)}
            >
              {t("actions.next")}
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </Section>
      {(result.events.length > 0 || result.loans.length > 0) && (
        <Section
          title={t("history.eventsLoans")}
          action={
            <button
              className="button secondary small"
              disabled={!current}
              onClick={() =>
                download(
                  {
                    format: "personia.event-details",
                    engineVersion: result.engineVersion,
                    fingerprint: result.fingerprint,
                    events: result.events,
                    loans: result.loans,
                  },
                  `${c.name}-events-and-financing.json`,
                )
              }
            >
              <Download size={14} />
              {t("history.details")}
            </button>
          }
        >
          <div className="metric-grid">
            <Metric
              label={t("history.principal")}
              value={money(result.summary.borrowed, c)}
            />
            <Metric
              label={t("history.debt")}
              value={money(result.summary.debt, c)}
            />
            <Metric
              label={t("history.interestPaid")}
              value={money(
                result.loans.reduce((s, x) => s + x.paidInterest, 0),
                c,
              )}
            />
            <Metric
              label={t("history.insurancePaid")}
              value={money(
                result.loans.reduce((s, x) => s + x.paidInsurance, 0),
                c,
              )}
            />
          </div>
          {result.events.map((e) => (
            <div className="event-result" key={e.id}>
              <div>
                <strong>{e.label}</strong>
                <small>
                  {dateLabel(e.startDate, true)} · {t(`events.${e.status}`)}
                </small>
              </div>
              <span>
                {t("history.expenses")} {money(e.expenses, c)} ·{" "}
                {t("history.income")} {money(e.receipts, c)}
              </span>
            </div>
          ))}
          {result.loans.slice(0, 20).map((loan) => (
            <details className="loan-details" key={loan.id}>
              <summary>
                {loan.label} · {money(loan.installment + loan.insurance, c)} /{" "}
                {t("studio.month").toLowerCase()} ·{" "}
                {money(loan.outstandingPrincipal, c)}{" "}
                {t("studio.remaining").toLowerCase()}
              </summary>
              <p className="muted">
                {loan.annualRate}% · {loan.months}{" "}
                {t("studio.month").toLowerCase()} · {t("studio.principal")}{" "}
                {money(loan.principal, c)} · {t("studio.insurance")}{" "}
                {money(loan.insurance, c)}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "date",
                        "principal",
                        "interest",
                        "insurance",
                        "remaining",
                        "status",
                      ].map((key) => (
                        <th key={key}>
                          {key === "date"
                            ? t("history.date")
                            : t(`studio.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loan.schedule
                      .filter((row) => row.status !== "before-window")
                      .slice(0, 12)
                      .map((row) => (
                        <tr key={row.number}>
                          <td>{dateLabel(row.dueDate, true)}</td>
                          <td>{money(row.principal, c)}</td>
                          <td>{money(row.interest, c)}</td>
                          <td>{money(row.insurance, c)}</td>
                          <td>{money(row.remainingPrincipal, c)}</td>
                          <td>
                            {row.status === "outside-window"
                              ? t("studio.outside")
                              : row.status === "paid"
                                ? t("studio.paid")
                                : t("events.pending")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </Section>
      )}
      {result.audit.length > 0 && (
        <Section
          title={t("history.audit")}
          action={
            <button
              className="button secondary small"
              disabled={!current}
              onClick={() =>
                download(
                  {
                    format: "personia.audit",
                    fingerprint: result.fingerprint,
                    audit: result.audit,
                  },
                  `${c.name}-deferred-spending.json`,
                )
              }
            >
              <Download size={14} />
              {t("history.details")}
            </button>
          }
        >
          <details>
            <summary>
              {result.audit.length} {t("history.audit").toLowerCase()}
            </summary>
            {result.audit.slice(0, 25).map((x, i) => (
              <div className="audit-row" key={i}>
                <span>{dateLabel(x.date, true)}</span>
                <span>{x.message}</span>
                {x.amount !== undefined && (
                  <strong>{money(x.amount, c)}</strong>
                )}
              </div>
            ))}
          </details>
        </Section>
      )}
      <details
        className="json-preview"
        onToggle={(event) => setShowJson(event.currentTarget.open)}
      >
        <summary>{t("history.json")}</summary>
        <pre>
          {statementPreview
            ? JSON.stringify(statementPreview, null, 2)
            : t("studio.recalculating")}
        </pre>
      </details>
      <div className="reproducibility">
        <span>
          {t("studio.fingerprint")} <code>{result.fingerprint}</code>
        </span>
        <span>{result.engineVersion}</span>
        <span>{file.reference.id}</span>
      </div>
    </>
  );
}
export function Metric({
  label,
  value,
  detail,
  negative = false,
}: {
  label: string;
  value: string;
  detail?: string;
  negative?: boolean;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={negative ? "negative" : ""}>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
