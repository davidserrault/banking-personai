import { useState } from "react";
import type { ConfigurationFile } from "../domain/types";
import { seasonalFactors } from "../engine";
import { Field } from "./controls";
import { categoryLabel, t } from "./messages";
import categories from "../../specifications/reference/categories.json";
export function Seasonality({ file }: { file: ConfigurationFile }) {
  const [category, setCategory] = useState("groceries");
  const factors = Array.from({ length: 12 }, (_, index) => ({
    month: new Date(Date.UTC(2024, index, 1)).toLocaleDateString("en-GB", {
      month: "short",
      timeZone: "UTC",
    }),
    ...seasonalFactors(
      file.configuration,
      category,
      index + 1,
      file.assumptions,
    ),
  }));
  return (
    <div className="seasonality-explorer">
      <Field
        label={t("behavior.category")}
        value={category}
        onChange={setCategory}
        options={categories.map((x) => [x.key, categoryLabel(x.key)])}
      />
      <p className="field-hint">{t("studio.seasonalNote")}</p>
      <div
        className="seasonal-bars"
        role="img"
        aria-label={`${categoryLabel(category)} — ${t("behavior.volume")}`}
      >
        {factors.map((x) => (
          <div key={x.month}>
            <span>
              {Number.isFinite(x.volume) ? x.volume.toFixed(2) : "—"}×
            </span>
            <i
              style={{
                height: `${Number.isFinite(x.volume) ? Math.max(2, Math.min(80, x.volume * 45)) : 0}px`,
              }}
            />
            <small>{x.month}</small>
          </div>
        ))}
      </div>
      <details>
        <summary>{t("behavior.factors")}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("studio.month")}</th>
                <th>{t("behavior.volume")}</th>
                <th>{t("behavior.basket")}</th>
              </tr>
            </thead>
            <tbody>
              {factors.map((x) => (
                <tr key={x.month}>
                  <td>{x.month}</td>
                  <td>{x.volume.toFixed(3)}×</td>
                  <td>{x.amount.toFixed(3)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
