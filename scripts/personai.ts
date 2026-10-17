#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generate } from "../src/engine";
import {
  applyCountryConversion,
  ConfigurationError,
  exportConfiguration,
  exportHistory,
  parseConfiguration,
  parseMerchantReference,
  previewCountryConversion,
} from "../src/config";
import type { ConfigurationFile } from "../src/domain/types";

const help = `PersonAI — deterministic synthetic banking scenarios

Usage:
  npm run personai -- validate --input scenario.personia.json
  npm run personai -- validate-reference --input merchants.json --country GB
  npm run personai -- create --model nicolas --name Alex --seed demo --output alex.personia.json
  npm run personai -- configure --input alex.personia.json --set incomes.0.amount=2500 --output alex.personia.json
  npm run personai -- generate --input alex.personia.json --output history.json [--account checking_nicolas]
  npm run personai -- convert --input alex.personia.json --reference merchants.json --rate 0.85 --missing inactive --output alex-gb.personia.json

create accepts --model andre|nicolas|lea|michel|sarah (default andre), --name, --seed, --start-date YYYY-MM-DD, --years.
configure accepts repeated --set path=JSON-value (plain unquoted text is also accepted).
convert requires --missing zero|inactive only when a positive envelope has no eligible local merchant.
All writes validate first. Dates are explicit: create preserves the supplied model's frozen origin unless --start-date is supplied.
`;
function argumentsFor(argv: string[]): {
  command: string;
  values: Record<string, string[]>;
} {
  const [command = "help", ...args] = argv,
    values: Record<string, string[]> = Object.create(null);
  const allowed = new Set([
    "input",
    "output",
    "model",
    "name",
    "seed",
    "start-date",
    "years",
    "set",
    "reference",
    "rate",
    "missing",
    "region",
    "country",
    "account",
  ]);
  for (let i = 0; i < args.length; i += 2) {
    if (
      !args[i].startsWith("--") ||
      !allowed.has(args[i].slice(2)) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(`Invalid option: ${args[i]}. Use --help for usage.`);
    const key = args[i].slice(2);
    (values[key] ??= []).push(args[i + 1]);
    if (key !== "set" && values[key].length > 1)
      throw new Error(`Option --${key} must not be repeated.`);
  }
  return { command, values };
}
async function atomicJson(path: string, value: unknown) {
  const destination = resolve(path),
    temporary = `${destination}.personai-${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
function setValue(file: ConfigurationFile, expression: string): void {
  const separator = expression.indexOf("=");
  if (separator < 1)
    throw new Error(
      "--set expects a configuration path followed by = and a value.",
    );
  const segments = expression.slice(0, separator).split(".");
  if (
    segments.some((segment) =>
      ["__proto__", "prototype", "constructor"].includes(segment),
    )
  )
    throw new Error("Unsafe configuration path.");
  const raw = expression.slice(separator + 1);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  let target: unknown = file.configuration;
  for (const segment of segments.slice(0, -1)) {
    if (
      target === null ||
      typeof target !== "object" ||
      !Object.hasOwn(target, segment)
    )
      throw new Error(
        `Unknown configuration path: ${expression.slice(0, separator)}.`,
      );
    target = (target as Record<string, unknown>)[segment];
  }
  if (target === null || typeof target !== "object")
    throw new Error("The configuration path does not refer to an object.");
  (target as Record<string, unknown>)[segments.at(-1)!] = value;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { command, values } = argumentsFor(argv);
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help);
    return;
  }
  const option = (key: string) => values[key]?.[0];
  const required = (key: string) => {
    const value = option(key);
    if (!value) throw new Error(`--${key} is required.`);
    return value;
  };
  if (command === "validate-reference") {
    const reference = parseMerchantReference(
      await readFile(required("input"), "utf8"),
      option("country"),
    );
    process.stdout.write(
      `Valid ${reference.countryCode} merchant reference: ${reference.id}, ${reference.merchants.length} merchants.\n`,
    );
    return;
  }
  let scenario: ConfigurationFile;
  if (command === "create") {
    const model = option("model") ?? "andre";
    if (!["andre", "nicolas", "lea", "michel", "sarah"].includes(model))
      throw new Error("Choose andre, nicolas, lea, michel or sarah.");
    scenario = parseConfiguration(
      await readFile(
        new URL(
          `../specifications/configurations/${model}.personia.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (option("name")) {
      scenario.configuration.name = option("name")!;
      scenario.configuration.id = `custom.${
        scenario.configuration.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "persona"
      }`;
      scenario.modelId = "custom";
    }
    if (option("seed")) scenario.configuration.seed = option("seed")!;
    if (option("start-date"))
      scenario.configuration.startDate = option("start-date")!;
    if (option("years")) scenario.configuration.years = Number(option("years"));
  } else {
    if (!["validate", "generate", "configure", "convert"].includes(command))
      throw new Error(`Unknown command: ${command}. Use --help for usage.`);
    scenario = parseConfiguration(await readFile(required("input"), "utf8"));
  }
  if (command === "configure")
    for (const expression of values.set ?? []) setValue(scenario, expression);
  if (command === "convert") {
    const reference = parseMerchantReference(
      await readFile(required("reference"), "utf8"),
      option("country"),
    );
    const missing = option("missing");
    if (missing && missing !== "zero" && missing !== "inactive")
      throw new Error("--missing must be zero or inactive.");
    const preview = previewCountryConversion(scenario, reference, {
      rate: option("rate") ? Number(option("rate")) : undefined,
      region: option("region"),
      missingCategories: missing
        ? Object.fromEntries(
            Object.keys(scenario.configuration.budgets).map((category) => [
              category,
              missing as "zero" | "inactive",
            ]),
          )
        : undefined,
    });
    scenario = applyCountryConversion(preview);
    for (const notice of preview.notices) process.stderr.write(`${notice}\n`);
  }
  scenario = exportConfiguration(
    scenario.configuration,
    scenario.reference,
    scenario.assumptions,
    scenario.modelId,
  );
  if (command === "validate") {
    process.stdout.write(
      `Valid configuration: ${scenario.configuration.name}, ${scenario.configuration.currency}.\nReference SHA-256: ${scenario.referenceHash}\n`,
    );
    return;
  }
  if (command === "generate") {
    const result = generate(
      scenario.configuration,
      scenario.reference,
      scenario.assumptions,
    );
    await atomicJson(
      required("output"),
      exportHistory(result, scenario, option("account")),
    );
    process.stdout.write(
      `Generated ${result.transactions.length} synthetic transactions. Fingerprint: ${result.fingerprint}\n`,
    );
  } else {
    await atomicJson(required("output"), scenario);
    process.stdout.write(
      `Saved validated configuration: ${resolve(required("output"))}\n`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof ConfigurationError ? error.message : error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
