import test from "node:test";
import assert from "node:assert/strict";
import andre from "../specifications/configurations/andre.personia.json";
import type { ConfigurationFile } from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import { DEFAULT_MODEL, loadModel, models } from "../src/ui/format";

test("André is the default model and preserves the complete authored scenario and calendar", () => {
  assert.equal(DEFAULT_MODEL, "andre");
  const expected = modernizeScenario(andre as ConfigurationFile);
  const loaded = loadModel();
  assert.deepEqual(loaded, expected);
  assert.equal(loaded.modelId, "andre");
  assert.equal(loaded.configuration.startDate, "2026-10-15");
  assert.equal(loaded.configuration.years, 4);
  assert.equal(
    loaded.configuration.accountTransfers![0].startDate,
    "2026-10-15",
  );
  loaded.configuration.accounts[0].openingBalance = 0;
  loaded.reference.merchants[0].name = "Edited locally";
  assert.deepEqual(loadModel("andre"), expected);
  assert.deepEqual(models.andre, andre);
});
