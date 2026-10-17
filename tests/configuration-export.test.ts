import test from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import templates from "../specifications/reference/event-templates.json";
import type { ConfigurationFile, PlannedEvent } from "../src/domain/types";
import type { SpendingModeKind } from "../src/domain/modes";
import { modernizeScenario } from "../src/config/profile";
import { newSpendingMode } from "../src/config/modes";
import { newCreditFacility } from "../src/config/credit-facilities";
import {
  exportConfiguration,
  parseConfiguration,
  exportHistory,
} from "../src/config/files";
import { generate } from "../src/engine";
import { previewCountryConversion } from "../src/config/conversion";
import {
  newWorkspace,
  editWorkspace,
  undoWorkspace,
  parseWorkspace,
  serializeWorkspace,
} from "../src/config/workspace";

test("legacy fee settings survive old-file and workspace loading without affecting current exports or balances", () => {
  const legacy = structuredClone(bundled) as ConfigurationFile;
  const before = structuredClone(legacy);
  const parsed = parseConfiguration(JSON.stringify(legacy));
  assert.equal("bankFees" in parsed.configuration, false);
  const exported = exportConfiguration(
    legacy.configuration,
    legacy.reference,
    legacy.assumptions,
    legacy.modelId,
  );
  assert.equal("bankFees" in exported.configuration, false);
  assert.deepEqual(parseConfiguration(JSON.stringify(exported)), parsed);
  const expected = generate(
    parsed.configuration,
    parsed.reference,
    parsed.assumptions,
  );
  assert.deepEqual(
    generate(legacy.configuration, legacy.reference, legacy.assumptions),
    expected,
  );
  const preview = previewCountryConversion(legacy, legacy.reference);
  assert.equal("bankFees" in preview.configuration, false);
  assert.ok(
    preview.changes.every((change) => !change.path.startsWith("bankFees")),
  );
  let workspace = newWorkspace(legacy);
  const edited = structuredClone(legacy);
  edited.configuration.bankFees!.commission = 0;
  edited.configuration.bankFees!.authorizedRate = 50;
  workspace = parseWorkspace(
    serializeWorkspace(editWorkspace(workspace, edited)),
  );
  for (const restored of [
    workspace.present,
    undoWorkspace(workspace).present,
  ]) {
    assert.deepEqual(
      generate(
        restored.configuration,
        restored.reference,
        restored.assumptions,
      ),
      expected,
    );
    assert.equal(
      "bankFees" in
        exportConfiguration(
          restored.configuration,
          restored.reference,
          restored.assumptions,
        ).configuration,
      false,
    );
  }
  assert.deepEqual(legacy, before);
});

test("configuration export preserves all settings, custom references and reproducible history", () => {
  const file = modernizeScenario(bundled as ConfigurationFile);
  const c = file.configuration;
  c.startDate = "2025-01-01";
  c.years = 1;
  c.locationDescription = "A fictional city";
  c.costOfLiving = 1.15;
  c.inflation = {
    rate: 2,
    period: "yearly",
    chargeOverrides: { [c.charges[0].id]: { rate: 0.2, period: "monthly" } },
    budgetOverrides: { groceries: { rate: 0, period: "yearly" } },
  };
  c.displayCurrency = "GBP";
  c.incomeTax = { enabled: true, frequency: "quarterly", day: 25, month: 12 };
  c.otherTaxes = [
    {
      id: "property",
      label: "Property tax",
      amount: 800,
      enabled: true,
      frequency: "annual",
      day: 15,
      month: 10,
    },
  ];
  c.creditFacilities = [newCreditFacility("auto", "auto", "2024-08-15")];
  c.spendingModes = ["survival", "yolo", "balanced", "investor", "planner"].map(
    (kind, i) => ({
      ...newSpendingMode(kind as SpendingModeKind, `mode-${i}`, "2025-01-01"),
      endDate: "2025-12-31",
      recurrence: "monthly" as const,
      duration: 14,
      cooldown: 5,
      transitionDuration: 2,
      priority: 50 + i,
      activationTriggers: {
        match: "all" as const,
        rules: [
          { metric: "dayOfMonth" as const, operator: "eq" as const, value: 1 },
        ],
      },
      deactivationTriggers: {
        match: "any" as const,
        rules: [
          {
            metric: "availableLiquidity" as const,
            operator: "lt" as const,
            value: 50,
          },
        ],
      },
    }),
  );
  c.spendingModes[0].enabled = false;
  c.spendingModes[1].activationTriggers.rules.push({
    metric: "incomeReceived",
    operator: "gte",
    value: 100,
    incomeKind: "bonus",
    incomeExpected: "unexpected",
    incomeCadence: "exceptional",
    incomeChange: "temporary",
  });
  c.incomes[0] = {
    ...c.incomes[0],
    kind: "salary",
    expected: true,
    cadence: "recurring",
    change: "persistent",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
  };
  c.plannedEvents = [
    {
      ...(structuredClone(
        templates.find((e) => e.type === "exceptional")!,
      ) as PlannedEvent),
      startDate: "2025-07-15",
      expected: true,
      mandatory: true,
      amount: 600,
    },
  ];
  c.budgetOverrides = { groceries: 350 };
  c.merchantOverrides = {
    [`${file.reference.id}|${c.style}|${file.reference.merchants[0].id}`]: {
      mean: 31.25,
      frequency: 3.5,
    },
  };
  file.reference.taxSystem = {
    rates: [0, 15, 35],
    rows: [
      { shares: 1, limits: [14000, 45000, null] },
      { shares: 2, limits: [28000, 90000, null] },
    ],
  };
  file.reference.merchants[0].mean = 23.45;
  file.modelId = "custom-complete";
  const before = structuredClone(file);
  const exported = exportConfiguration(
    c,
    file.reference,
    file.assumptions,
    file.modelId,
  );
  const restored = parseConfiguration(JSON.stringify(exported));
  assert.deepEqual(file, before, "export must not mutate active settings");
  assert.deepEqual(restored.configuration, c);
  assert.deepEqual(restored.reference, file.reference);
  assert.deepEqual(restored.assumptions, file.assumptions);
  assert.equal(restored.modelId, file.modelId);
  const result = generate(c, file.reference, file.assumptions);
  assert.deepEqual(
    generate(restored.configuration, restored.reference, restored.assumptions),
    result,
  );
  const statement = exportHistory(result, restored);
  assert.deepEqual(statement.meta.persona, { id: c.id, name: c.name });
  assert.ok(!("configuration" in statement.meta));
  assert.ok(!("reference" in statement.meta));
  assert.ok(!("assumptions" in statement.meta));
});
