import { useEffect, useRef, useState } from "react";
import {
  SlidersHorizontal,
  Library,
  Upload,
  ArrowUpRight,
  Download,
  Check,
  LoaderCircle,
  AlertCircle,
  ChevronRight,
  UserRound,
  Wallet,
  Receipt,
  Activity,
  CalendarDays,
  Hourglass,
  Fingerprint,
  Undo2,
  Redo2,
} from "lucide-react";
import type { ConfigurationFile, PersonaConfig } from "./domain/types";
import {
  parseConfiguration,
  exportConfiguration,
  exportHistory,
} from "./config";
import { Configuration, type ConfigTab } from "./ui/Configuration";
import {
  Reference,
  mergeReference,
  type ReferenceDraft,
  type ReferenceTab,
} from "./ui/Reference";
import { ServiceIntro } from "./ui/ServiceIntro";
import { referenceHash } from "./config/canonical";
import { modernizeScenario } from "./config/profile";
import { taxEstimate } from "./engine/taxes";
import { facilityLoan, replacesHousing } from "./engine/loans";
import { History, type HistoryTab } from "./ui/History";
import { BalanceChart } from "./ui/Charts";
import { ledgerAccounts } from "./config/payment-cards";
import { combinedBalance, isAllAccounts } from "./ui/balance-data";
import { Field, ErrorsContext } from "./ui/controls";
import { useSimulation } from "./ui/useSimulation";
import { useWorkspace } from "./ui/useWorkspace";
import { t, messages } from "./ui/messages";
import { models, loadModel, money, monthlyIncome, download } from "./ui/format";
export default function App() {
  const { file, setFile, canUndo, canRedo, undo, redo, storageError } =
    useWorkspace();
  const [tab, setTab] = useState("configuration");
  const [configTab, setConfigTab] = useState<ConfigTab>("profile");
  const [account, setAccount] = useState("all");
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>("merchants");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("summary");
  const applyReference = (patch: ReferenceDraft) =>
    setFile((previous) => {
      const next = mergeReference(previous, patch);
      next.referenceHash = referenceHash(next.reference);
      return next;
    });
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const sim = useSimulation(file);
  const recalculating = sim.status === "waiting" || sim.status === "running";
  const c = file.configuration;
  const displayedFile = sim.resultFile ?? file;
  const displayed = displayedFile.configuration;
  const notify = (text: string) => {
    setNotice(text);
  };
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const update = (fn: (c: PersonaConfig) => void) =>
    setFile((previous) => {
      const next = structuredClone(previous);
      fn(next.configuration);
      return next;
    });
  const replace = (next: ConfigurationFile) => {
    setFile(modernizeScenario(next));
    setAccount("all");
    setTab("configuration");
    setConfigTab("profile");
    setFileError("");
  };
  const load = async (input: File) => {
    const request = ++loadSequence.current;
    setImporting(true);
    setFileError("");
    try {
      if (input.size > 5 * 1024 * 1024) throw new Error(t("errors.size"));
      const value = parseConfiguration(await input.text());
      if (request === loadSequence.current) {
        replace(value);
        notify(t("status.loaded"));
      }
    } catch (e) {
      if (request === loadSequence.current)
        setFileError(e instanceof Error ? e.message : t("studio.importError"));
    } finally {
      if (request === loadSequence.current) setImporting(false);
    }
  };
  const saveConfig = () => {
    try {
      download(
        exportConfiguration(c, file.reference, file.assumptions, file.modelId),
        `${c.name}-configuration.personia.json`,
      );
      notify(t("status.downloaded"));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : t("studio.exportError"));
    }
  };
  const saveHistory = (scope = account) => {
    if (!sim.current || !sim.result) return;
    try {
      download(
        exportHistory(
          sim.result,
          file,
          isAllAccounts(scope) ? undefined : scope,
        ),
        `${c.name}-${isAllAccounts(scope) ? "all" : scope}-account-history.json`,
      );
      notify(t("status.downloaded"));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : t("studio.exportError"));
    }
  };
  const icons = {
    profile: UserRound,
    accounts: Wallet,
    charges: Receipt,
    behavior: Activity,
    events: CalendarDays,
    modes: SlidersHorizontal,
    horizon: Hourglass,
  };
  const tabCounts: Partial<Record<ConfigTab, number>> = {
    accounts: ledgerAccounts(c).length,
    events: c.plannedEvents.length,
    modes: c.spendingModes?.length ?? 0,
  };
  const titles = {
    profile: ["studio.profileTitle", "studio.profileIntro"],
    accounts: ["studio.accountTitle", "studio.accountIntro"],
    charges: ["studio.chargesTitle", "studio.chargesIntro"],
    behavior: ["studio.behaviorTitle", "studio.behaviorIntro"],
    events: ["studio.eventsTitle", "studio.eventsIntro"],
    modes: ["studio.modesTitle", "studio.modesIntro"],
    horizon: ["studio.horizonTitle", "studio.horizonIntro"],
  };
  const income = monthlyIncome(c);
  let monthlyTaxes = 0;
  try {
    monthlyTaxes =
      (c.incomeTax?.enabled
        ? taxEstimate(c, file.reference.taxSystem).annualTax / 12
        : 0) +
      (c.otherTaxes ?? []).reduce(
        (sum, x) =>
          sum +
          (x.enabled
            ? (x.amount *
                (x.frequency === "monthly"
                  ? 12
                  : x.frequency === "quarterly"
                    ? 4
                    : 1)) /
              12
            : 0),
        0,
      );
  } catch {}
  const charges =
    monthlyTaxes +
    c.charges
      .filter(
        (x) =>
          x.enabled &&
          x.id !== "fees" &&
          !(x.id === "housing" && replacesHousing(c, c.startDate)),
      )
      .reduce((s, x) => s + x.amount, 0) +
    (c.creditFacilities ?? [])
      .filter((x) => x.enabled && x.startDate <= c.startDate)
      .reduce((sum, x) => {
        try {
          const loan = facilityLoan(x, c, c.startDate);
          return (
            sum + (loan.outstandingPrincipalMinor > 0 ? loan.installment : 0)
          );
        } catch {
          return sum;
        }
      }, 0);
  const selectedResult = sim.result?.accounts.find((x) => x.key === account);
  const opening = isAllAccounts(account)
    ? sim.result?.summary.openingAssets
    : selectedResult?.openingBalance;
  const closing = isAllAccounts(account)
    ? sim.result &&
      combinedBalance(
        sim.result.accounts.map((account) => account.closingBalance),
        sim.result.currencyDigits,
      )
    : selectedResult?.closingBalance;
  useEffect(() => {
    if (
      !isAllAccounts(account) &&
      !ledgerAccounts(c).some((x) => x.key === account)
    )
      setAccount("all");
  }, [c.accounts, c.paymentCards, account]);
  return (
    <div className="app">
      <h1 className="sr-only">
        {t("app.title")} — {t("app.tagline")}
      </h1>
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label={t("app.title")}
          onClick={(e) => {
            e.preventDefault();
            setTab("configuration");
          }}
        >
          <span>
            Persona <span className="brand-ai">Ledger</span>
            <sup>STUDIO 2</sup>
          </span>
        </a>
        <div className="header-divider" />
        <div className="model-select">
          <Field
            label={t("header.model")}
            value={file.modelId in models ? file.modelId : "imported"}
            options={[
              ...Object.entries(messages.models).map(
                ([id, label]) => [id, `${label} · FR`] as [string, string],
              ),
              ...(!(file.modelId in models)
                ? [["imported", t("header.imported")] as [string, string]]
                : []),
            ]}
            onChange={(id) => {
              if (id === "imported") return;
              ++loadSequence.current;
              replace(loadModel(id));
            }}
          />
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            disabled={importing}
            onClick={() => fileInput.current?.click()}
          >
            {importing ? (
              <LoaderCircle size={16} className="spinning" />
            ) : (
              <Upload size={16} />
            )}
            <span>{importing ? t("status.importing") : t("header.load")}</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            accept="application/json,.json"
            aria-label={t("header.load")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void load(f);
              }
              e.target.value = "";
            }}
          />
          <span className="synthetic-badge">
            <Fingerprint size={15} />
            {t("app.badge")}
          </span>
        </div>
      </header>
      <nav className="primary-nav" aria-label={t("app.title")}>
        {(["configuration", "reference", "history"] as const).map((key, i) => {
          const Icon = [SlidersHorizontal, Library, Wallet][i];
          return (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              <Icon size={17} />
              {t(`navigation.${key === "history" ? "accounts" : key}`)}
            </button>
          );
        })}
        <div className="navigation-tools">
          <div className={`simulation-status ${sim.status}`} role="status">
            {sim.current ? (
              <Check size={14} />
            ) : ["waiting", "running"].includes(sim.status) ? (
              <LoaderCircle size={14} className="spinning" />
            ) : (
              <AlertCircle size={14} />
            )}
            <span>
              {sim.status === "ready"
                ? t("status.ready")
                : sim.status === "error"
                  ? t("errors.worker")
                  : t(`status.${sim.status}`)}
            </span>
          </div>
          <div
            className="configuration-history"
            role="group"
            aria-label="Configuration changes"
          >
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo last configuration change"
              disabled={!canUndo || importing}
              onClick={() => {
                undo();
                setFileError("");
              }}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo configuration change"
              disabled={!canRedo || importing}
              onClick={() => {
                redo();
                setFileError("");
              }}
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>
      </nav>
      <main>
        {storageError && (
          <div className="error-banner" role="alert">
            {storageError}
          </div>
        )}
        {fileError && (
          <div className="error-banner" role="alert">
            <strong>{t("studio.importError")}</strong>
            <p>{fileError}</p>
            <button className="text-button" onClick={() => setFileError("")}>
              {t("actions.close")}
            </button>
          </div>
        )}
        {sim.status === "invalid" && (
          <div className="error-banner" role="alert">
            <strong>{t("status.invalid")}</strong>
            {sim.issues.slice(0, 8).map((x, i) => (
              <p key={i}>
                {x.path}: {x.message}
              </p>
            ))}
          </div>
        )}
        {sim.status === "error" && (
          <div className="error-banner" role="alert">
            {t("errors.worker")}
            <p>{sim.error}</p>
            <button className="button secondary small" onClick={sim.retry}>
              {t("studio.retry")}
            </button>
          </div>
        )}
        {!sim.current && sim.result && (
          <div className="stale-banner">{t("studio.resultOld")}</div>
        )}
        {tab === "configuration" && (
          <>
            <ServiceIntro section="configuration" />
            <div className="configuration-layout">
              <div className="editor-column">
                <nav
                  className="secondary-nav"
                  aria-label={t("navigation.configuration")}
                >
                  {(Object.keys(icons) as ConfigTab[]).map((key) => {
                    const Icon = icons[key];
                    return (
                      <button
                        key={key}
                        className={configTab === key ? "active" : ""}
                        onClick={() => setConfigTab(key)}
                      >
                        <Icon size={15} />
                        <span>
                          {t(`navigation.${key}`)}
                          {tabCounts[key] !== undefined
                            ? ` (${tabCounts[key]})`
                            : ""}
                        </span>
                      </button>
                    );
                  })}
                </nav>
                <div className="subheading">
                  <h2>{t(titles[configTab][0])}</h2>
                  <p>{t(titles[configTab][1])}</p>
                </div>
                <ErrorsContext.Provider value={sim.issues}>
                  <Configuration
                    file={file}
                    tab={configTab}
                    update={update}
                    onReferenceChange={applyReference}
                  />
                </ErrorsContext.Provider>
              </div>
              <aside className="persona-recap" aria-busy={recalculating}>
                {recalculating && (
                  <div className="recap-loader" role="status">
                    <LoaderCircle
                      size={28}
                      className="spinning"
                      aria-hidden="true"
                    />
                    <span>{t("studio.recalculating")}</span>
                  </div>
                )}
                <div className="recap-content" inert={recalculating}>
                  <div className="recap-top">
                    <span className="eyebrow">{t("recap.title")}</span>
                    <Fingerprint size={20} />
                  </div>
                  <div className="persona-identity">
                    <span className="avatar">{c.name.slice(0, 1) || "P"}</span>
                    <div>
                      <h2>{c.name || "—"}</h2>
                      <p>
                        {Number.isFinite(c.age) ? c.age : "—"}
                        {c.locationDescription
                          ? " · " + c.locationDescription
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="persona-tags">
                    <span>{c.costOfLiving ?? 1}× living costs</span>
                    <span>
                      {c.household} {t("profile.household").toLowerCase()}
                    </span>
                    <span>
                      {
                        (messages.options.housing as Record<string, string>)[
                          c.housing
                        ]
                      }
                    </span>
                  </div>
                  <div className="recap-finances">
                    <div className="recap-metric">
                      <span>{t("recap.income")}</span>
                      <strong>{money(income, c)}</strong>
                    </div>
                    <div className="recap-metric">
                      <span>{t("recap.charges")}</span>
                      <strong>{money(charges, c)}</strong>
                    </div>
                    <div className="recap-metric recap-remainder">
                      <span>{t("recap.remainder")}</span>
                      <strong
                        className={income - charges < 0 ? "negative" : ""}
                      >
                        {money(income - charges, c)}
                      </strong>
                    </div>
                  </div>
                  <div className="recap-balance">
                    <div className="section-heading">
                      <h3>{t("history.chart")}</h3>
                      <ArrowUpRight size={16} />
                    </div>
                    <Field
                      label={t("history.account")}
                      value={account}
                      options={[
                        ["all", "All account balances"],
                        ["combined", "Combined balance"],
                        ...ledgerAccounts(c).map(
                          (x) => [x.key, x.name] as [string, string],
                        ),
                      ]}
                      onChange={setAccount}
                    />
                    <button
                      className="chart-link"
                      aria-label={t("actions.viewHistory")}
                      onClick={() => {
                        setHistoryTab("summary");
                        setTab("history");
                      }}
                    >
                      {sim.result ? (
                        <BalanceChart
                          result={sim.result}
                          config={displayed}
                          account={account}
                          compact
                        />
                      ) : (
                        <div className="chart-loading">
                          <Activity size={30} />
                          {t("status.waiting")}
                        </div>
                      )}
                    </button>
                    <div className="recap-metric recap-opening">
                      <span>{t("recap.opening")}</span>
                      <strong>
                        {opening !== undefined
                          ? money(opening, displayed)
                          : "—"}
                      </strong>
                    </div>
                    <div className="recap-metric recap-closing">
                      <span>{t("recap.closing")}</span>
                      <strong className={(closing ?? 0) < 0 ? "negative" : ""}>
                        {closing !== undefined
                          ? money(closing, displayed)
                          : "—"}
                      </strong>
                    </div>
                    <button
                      className="button secondary full"
                      onClick={() => saveHistory()}
                      disabled={!sim.current || !sim.result}
                    >
                      {t("actions.downloadHistory")}
                      <Download size={17} />
                    </button>
                  </div>
                  <div className="recap-actions">
                    <button
                      className="button primary full"
                      onClick={saveConfig}
                    >
                      <Download size={14} />
                      {t("actions.downloadConfiguration")}
                    </button>
                  </div>
                  <div className="recap-footer">
                    <Fingerprint size={13} />
                    {t("studio.revision")}
                    {sim.result && <code>{sim.result.fingerprint}</code>}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
        {tab === "reference" && (
          <>
            <Reference
              file={file}
              onApply={applyReference}
              tab={referenceTab}
              onTab={setReferenceTab}
              onReference={(reference) =>
                setFile((previous) => {
                  const next = modernizeScenario({ ...previous, reference });
                  next.configuration.referenceId = reference.id;
                  next.configuration.merchantOverrides = {};
                  if (reference.settings)
                    Object.assign(next.configuration, reference.settings);
                  delete next.reference.settings;
                  return modernizeScenario(next);
                })
              }
              onTaxSystem={(taxSystem) =>
                setFile((previous) => {
                  const next = {
                    ...previous,
                    reference: { ...previous.reference, taxSystem },
                  };
                  next.referenceHash = referenceHash(next.reference);
                  return next;
                })
              }
            />
          </>
        )}
        {tab === "history" && (
          <History
            key={sim.result?.fingerprint ?? "empty"}
            result={sim.result}
            file={displayedFile}
            account={account}
            onAccount={setAccount}
            tab={historyTab}
            onTab={setHistoryTab}
            current={sim.current}
            onExport={() => saveHistory()}
          />
        )}
      </main>
      <footer className="app-footer">
        <span>
          <span className="footer-brand">Persona Ledger Studio 2</span> /{" "}
          {t("studio.workshop")}
        </span>
        <span>
          {c.displayCurrency ?? c.currency} · {file.reference.id}
        </span>
        <p>{t("studio.assumptionNote")}</p>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
