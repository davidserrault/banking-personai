import { modernizeScenario } from "../config/profile";
import {
  monthlyEnvelopes,
  merchantRates,
  monthlyIncome as engineMonthlyIncome,
} from "../engine";
import { addMonths } from "../engine/calendar";
export { addMonths } from "../engine/calendar";
import type { ConfigurationFile, PersonaConfig } from "../domain/types";
import andre from "../../specifications/configurations/andre.personia.json";
import nicolas from "../../specifications/configurations/nicolas.personia.json";
import lea from "../../specifications/configurations/lea.personia.json";
import sarah from "../../specifications/configurations/sarah.personia.json";
import michel from "../../specifications/configurations/michel.personia.json";
export const DEFAULT_MODEL = "andre";
export const models = {
  andre,
  nicolas,
  lea,
  sarah,
  michel,
} as unknown as Record<string, ConfigurationFile>;
export const money = (
  value: number,
  config: Pick<
    PersonaConfig,
    "currency" | "currencyDigits" | "displayCurrency"
  >,
) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: config.displayCurrency ?? config.currency,
    currencyDisplay: "code",
    minimumFractionDigits: config.currencyDigits,
    maximumFractionDigits: config.currencyDigits,
  }).format(Number.isFinite(value) ? (value === 0 ? 0 : value) : 0);
export const number = (value: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
export const dateLabel = (date: string, short = false) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date.slice(0, 10) + "T12:00:00Z"));

export function endDate(config: PersonaConfig) {
  const end = new Date(
    addMonths(config.startDate, config.years * 12) + "T12:00:00Z",
  );
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}
export function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function loadModel(id = DEFAULT_MODEL): ConfigurationFile {
  const file = structuredClone(models[id]);
  // André is an authored scenario: keep its origin and all related dates intact.
  if (id !== "andre")
    file.configuration.startDate = addMonths(
      todayInZone(file.configuration.timeZone),
      -12,
    );
  return modernizeScenario(file);
}
export const monthlyIncome = (config: PersonaConfig) =>
  engineMonthlyIncome(config.incomes);
export function download(value: unknown, filename: string) {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined)
    throw new Error("The export cannot be serialized as JSON.");
  const url = URL.createObjectURL(
    new Blob([`${json}\n`], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const safeFilename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  const extension = safeFilename.match(/(?:\.personia)?\.[^.]+$/i)?.[0] ?? "";
  const basename = safeFilename.slice(
    0,
    safeFilename.length - extension.length,
  );
  anchor.download = `${basename}-${timestamp}${extension}`;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function safeEnvelopes(
  config: PersonaConfig,
  reference: ConfigurationFile["reference"],
  assumptions: ConfigurationFile["assumptions"],
) {
  try {
    return monthlyEnvelopes(config, reference, assumptions);
  } catch {
    return Object.fromEntries(
      Object.keys(config.budgets).map((key) => [
        key,
        config.budgetOverrides?.[key] ?? config.budgets[key],
      ]),
    );
  }
}
export function safeRates(
  config: PersonaConfig,
  reference: ConfigurationFile["reference"],
  assumptions: ConfigurationFile["assumptions"],
) {
  try {
    return merchantRates(config, reference, assumptions);
  } catch {
    return reference.merchants.map((merchant) => ({
      merchant,
      mean:
        config.merchantOverrides?.[
          `${reference.id}|${config.style}|${merchant.id}`
        ]?.mean ?? merchant.mean,
      frequency:
        config.merchantOverrides?.[
          `${reference.id}|${config.style}|${merchant.id}`
        ]?.frequency ?? 0,
      eligible: false,
      weight: 0,
    }));
  }
}
