import { TaxReference } from "./TaxReference";
import { useState, useRef } from "react";
import { Search, RotateCcw, Upload, Download, Plus } from "lucide-react";
import type {
  ConfigurationFile,
  Merchant,
  CountryMerchantReference,
  TaxSystem,
} from "../domain/types";
import {
  safeEnvelopes as monthlyEnvelopes,
  safeRates as merchantRates,
} from "./format";
import {
  validateScenario,
  exportReferenceSettings,
  parseMerchantReference,
} from "../config";
import {
  editMerchantCatalog,
  type ReferenceEdit,
} from "../config/reference-adjustments";
import { ReferenceAdjustment, ReferenceNumber } from "./ReferenceAdjustment";
import {
  Field,
  Section,
  AddButton,
  DeleteButton,
  ErrorsContext,
} from "./controls";
import { t, messages, categoryLabel, enumLabel } from "./messages";
import { money, download } from "./format";
import categories from "../../specifications/reference/categories.json";
export { mergeReference, type ReferenceDraft } from "../config/reference-draft";
import { mergeReference, type ReferenceDraft } from "../config/reference-draft";
export function Reference({
  file,
  onApply,
  onNavigate,
  onReference,
  onTaxSystem,
}: {
  file: ConfigurationFile;
  onApply: (patch: ReferenceDraft) => void;
  onNavigate: (section: "profile" | "behavior") => void;
  onReference: (reference: CountryMerchantReference) => void;
  onTaxSystem: (system: TaxSystem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<ReferenceEdit>();
  const [revision, setRevision] = useState(0);
  const [exportError, setExportError] = useState("");
  const closeEdit = () => {
    setEdit(undefined);
    setRevision((n) => n + 1);
  };
  const [category, setCategory] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newMerchant, setNewMerchant] = useState({
    name: "",
    category: "groceries",
    segment: "everyday",
    mean: 25,
    frequency: 1,
  });
  const c = file.configuration;
  const envelopes = monthlyEnvelopes(c, file.reference, file.assumptions);
  const rates = merchantRates(c, file.reference, file.assumptions);
  const issues = validateScenario(c, file.reference, file.assumptions);
  const total = Object.values(envelopes).reduce((sum, value) => sum + value, 0);
  const patch = (value: ReferenceDraft) => {
    onApply(value);
    setRevision((n) => n + 1);
  };
  const saveReference = () => {
    try {
      download(
        exportReferenceSettings(file),
        `${file.reference.id}-settings.json`,
      );
      setExportError("");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  };
  const shown = rates.filter(
    (x) =>
      x.merchant.category !== "taxes" &&
      (category === "all" || x.merchant.category === category) &&
      `${x.merchant.name} ${categoryLabel(x.merchant.category)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <ErrorsContext.Provider value={issues}>
      <div className="reference-context">
        <div>
          <span className="eyebrow">{c.displayCurrency ?? c.currency}</span>
          <h2>{file.reference.name}</h2>
          <p className="muted">
            {file.reference.id} · {file.reference.merchants.length}{" "}
            {t("reference.merchant").toLowerCase()}s · {t("studio.assumptions")}
          </p>
        </div>
        <div className="reference-file-actions">
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error(
                    "Reference files must be smaller than 5 MiB.",
                  );
                onReference(parseMerchantReference(await file.text()));
                setExportError("");
              } catch (error) {
                setExportError(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          />
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {t("country.load")}
          </button>
          <button
            className="button secondary"
            onClick={saveReference}
            disabled={issues.length > 0}
          >
            <Download size={16} />
            Download reference
          </button>
        </div>
      </div>
      {exportError && (
        <p className="error-banner" role="alert">
          {exportError}
        </p>
      )}
      <div className="reference-links">
        <span>
          {c.locationDescription || "Location unspecified"} ·{" "}
          {(messages.profiles as Record<string, string>)[c.style]}
        </span>
        <button className="text-button" onClick={() => onNavigate("profile")}>
          Edit data context in Profile
        </button>
        <span>Monthly budget: {money(total, c)}</span>
        <button className="text-button" onClick={() => onNavigate("behavior")}>
          Edit budget in Behaviour
        </button>
      </div>
      <TaxReference
        config={c}
        system={file.reference.taxSystem}
        onChange={onTaxSystem}
      />
      <Section
        title={t("reference.title")}
        description="Adding or removing a merchant updates the category budget. Editing an amount or frequency lets you choose which linked values change."
        action={
          <AddButton onClick={() => setAdding(!adding)}>
            {t("reference.addMerchant")}
          </AddButton>
        }
      >
        {adding && (
          <div className="editor-card">
            <div className="form-grid">
              <Field
                label={t("studio.merchantName")}
                value={newMerchant.name}
                onChange={(v) => setNewMerchant((x) => ({ ...x, name: v }))}
              />
              <Field
                label={t("studio.category")}
                value={newMerchant.category}
                options={categories
                  .filter((x) => x.key !== "taxes")
                  .map((x) => [x.key, categoryLabel(x.key)])}
                onChange={(v) => setNewMerchant((x) => ({ ...x, category: v }))}
              />
              <Field
                label={t("studio.segment")}
                value={newMerchant.segment}
                options={Object.entries(messages.segments)}
                onChange={(v) => setNewMerchant((x) => ({ ...x, segment: v }))}
              />
              <Field
                label={t("reference.mean")}
                type="number"
                min={0.01}
                value={newMerchant.mean}
                onChange={(v) => setNewMerchant((x) => ({ ...x, mean: v }))}
              />
              <Field
                label={t("reference.frequency")}
                type="number"
                min={0}
                value={newMerchant.frequency}
                onChange={(v) =>
                  setNewMerchant((x) => ({ ...x, frequency: v }))
                }
              />
            </div>
            <button
              className="button secondary"
              disabled={
                !newMerchant.name.trim() ||
                !Number.isFinite(newMerchant.mean) ||
                newMerchant.mean <= 0 ||
                !Number.isFinite(newMerchant.frequency) ||
                newMerchant.frequency < 0
              }
              onClick={() => {
                const merchant: Merchant = {
                  id:
                    Math.max(
                      900000,
                      ...file.reference.merchants.map((x) => x.id),
                    ) + 1,
                  name: newMerchant.name,
                  category: newMerchant.category,
                  segment: newMerchant.segment,
                  mean: newMerchant.mean,
                  regions: ["*"],
                  scenario: true,
                };
                try {
                  patch(
                    editMerchantCatalog(file, merchant.category, merchant.id, {
                      merchant,
                      frequency: newMerchant.frequency,
                    }),
                  );
                  setExportError("");
                } catch (error) {
                  setExportError(
                    error instanceof Error ? error.message : String(error),
                  );
                  return;
                }
                setAdding(false);
                setNewMerchant((x) => ({ ...x, name: "" }));
              }}
            >
              <Plus size={16} />
              {t("studio.addMerchant")}
            </button>
          </div>
        )}
        <div className="table-filters">
          <div className="search-input">
            <Search size={16} />
            <input
              placeholder={t("reference.search")}
              aria-label={t("reference.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Field
            label={t("studio.category")}
            value={category}
            options={[
              ["all", t("history.allCategories")],
              ...categories.map(
                (x) => [x.key, categoryLabel(x.key)] as [string, string],
              ),
            ]}
            onChange={setCategory}
          />
        </div>
        <div className="table-scroll">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>{t("reference.merchant")}</th>
                <th>{t("studio.category")}</th>
                <th>
                  {t("reference.mean")} · {c.displayCurrency ?? c.currency}
                </th>
                <th>{t("reference.frequency")}</th>
                <th>{t("reference.availability")}</th>
                <th>
                  <span className="sr-only">{t("actions.reset")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ merchant: m, mean, frequency, eligible }) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    <small>
                      {enumLabel("segments", m.segment ?? "everyday")}
                      {m.scenario ? ` · ${t("studio.enabledMerchant")}` : ""}
                    </small>
                  </td>
                  <td>{categoryLabel(m.category)}</td>
                  <td>
                    <ReferenceNumber
                      label={m.name + " " + t("reference.mean")}
                      value={mean}
                      revision={revision}
                      min={10 ** -c.currencyDigits}
                      step={10 ** -c.currencyDigits}
                      disabled={!eligible}
                      onCommit={(value) =>
                        setEdit({ kind: "mean", merchantId: m.id, value })
                      }
                    />
                  </td>
                  <td>
                    <ReferenceNumber
                      label={m.name + " " + t("reference.frequency")}
                      value={Number(frequency.toFixed(4))}
                      revision={revision}
                      step={0.01}
                      disabled={!eligible}
                      onCommit={(value) =>
                        setEdit({ kind: "frequency", merchantId: m.id, value })
                      }
                    />
                  </td>
                  <td>
                    <span className={`chip ${eligible ? "" : "muted"}`}>
                      {eligible
                        ? t("studio.eligible")
                        : t("studio.unavailable")}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`${t("actions.reset")} ${m.name}`}
                      disabled={!eligible}
                      onClick={() => {
                        const id =
                          file.reference.id + "|" + c.style + "|" + m.id;
                        const automatic = mergeReference(file, {
                          merchantOverrides: { [id]: undefined },
                        });
                        const rate = merchantRates(
                          automatic.configuration,
                          automatic.reference,
                          automatic.assumptions,
                        ).find((r) => r.merchant.id === m.id)!;
                        setEdit({
                          kind: "mean",
                          merchantId: m.id,
                          value: rate.mean,
                        });
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                    {m.scenario && (
                      <DeleteButton
                        label={"Remove " + m.name}
                        onClick={() => {
                          try {
                            patch(editMerchantCatalog(file, m.category, m.id));
                            setExportError("");
                          } catch (error) {
                            setExportError(
                              error instanceof Error
                                ? error.message
                                : String(error),
                            );
                          }
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="empty">{t("reference.empty")}</p>}
        </div>
      </Section>
      {edit && (
        <ReferenceAdjustment
          file={file}
          edit={edit}
          onClose={closeEdit}
          onApply={(value) => {
            patch(value);
            closeEdit();
          }}
        />
      )}
      {issues.length > 0 && (
        <div className="error-banner" role="alert">
          {issues.slice(0, 8).map((x, i) => (
            <p key={i}>
              {x.path}: {x.message}
            </p>
          ))}
        </div>
      )}
    </ErrorsContext.Provider>
  );
}
