import test from "node:test";
import assert from "node:assert/strict";
import bundled from "../specifications/configurations/nicolas.personia.json";
import type { ConfigurationFile } from "../src/domain/types";
import { modernizeScenario } from "../src/config/profile";
import { referenceHash } from "../src/config/canonical";
import { newSpendingMode } from "../src/config/modes";
import { parseConfiguration } from "../src/config/files";
import {
  newWorkspace,
  editWorkspace,
  undoWorkspace,
  redoWorkspace,
  parseWorkspace,
  serializeWorkspace,
  saveWorkspace,
  WORKSPACE_KEY,
  HISTORY_LIMIT,
} from "../src/config/workspace";
import { generate } from "../src/engine";
const file = () => modernizeScenario(bundled as ConfigurationFile);

test("browser restoration retains complete configuration and both sides of undo history", () => {
  const initial = file();
  const next = structuredClone(initial);
  next.configuration.name = "Saved persona";
  next.configuration.incomes[0].amount = 2500;
  next.configuration.spendingModes = [
    newSpendingMode("planner", "planner", next.configuration.startDate),
  ];
  next.reference.taxSystem!.rates[1] = 12;
  next.reference.merchants[0].mean = 123.45;
  next.referenceHash = referenceHash(next.reference);
  const third = structuredClone(next);
  third.configuration.costOfLiving = 1.2;
  let state = editWorkspace(editWorkspace(newWorkspace(initial), next), third);
  state = undoWorkspace(state);
  const restored = parseWorkspace(serializeWorkspace(state));
  assert.deepEqual(restored.present, next);
  assert.deepEqual(undoWorkspace(restored).present, initial);
  assert.deepEqual(redoWorkspace(restored).present, third);
  assert.deepEqual(
    generate(
      restored.present.configuration,
      restored.present.reference,
      restored.present.assumptions,
    ),
    generate(next.configuration, next.reference, next.assumptions),
  );
  assert.equal(initial.configuration.name, "Nicolas");
});

test("typing is one undo step; distinct controls and deliberate pauses remain separate", () => {
  let state = newWorkspace(file());
  const start = state.present;
  for (const [name, time] of [
    ["A", 100],
    ["Al", 200],
    ["Alex", 400],
  ] as const) {
    const next = structuredClone(state.present);
    next.configuration.name = name;
    state = editWorkspace(state, next, "name-input", time);
  }
  assert.equal(state.past.length, 1);
  assert.deepEqual(undoWorkspace(state).present, start);
  const changedAge = structuredClone(state.present);
  changedAge.configuration.age = 45;
  state = editWorkspace(state, changedAge, "age-input", 500);
  assert.equal(state.past.length, 2);
  const changedAgeAgain = structuredClone(state.present);
  changedAgeAgain.configuration.age = 46;
  state = editWorkspace(state, changedAgeAgain, "age-input", 1500);
  assert.equal(state.past.length, 3);
});

test("new edits clear redo; no-op updates retain it and empty history does nothing", () => {
  const empty = newWorkspace(file());
  assert.equal(undoWorkspace(empty), empty);
  assert.equal(redoWorkspace(empty), empty);
  const changed = structuredClone(empty.present);
  changed.configuration.children = 1;
  let state = undoWorkspace(editWorkspace(empty, changed));
  assert.equal(editWorkspace(state, structuredClone(state.present)), state);
  const branch = structuredClone(state.present);
  branch.configuration.household = 3;
  state = editWorkspace(state, branch);
  assert.equal(state.future.length, 0);
  assert.deepEqual(undoWorkspace(state).present, empty.present);
});

test("adding/removing arrays and optional fields undo without overwriting other settings", () => {
  let state = newWorkspace(file());
  const initial = state.present;
  const added = structuredClone(initial);
  added.configuration.spendingModes = [
    newSpendingMode("yolo", "temporary", added.configuration.startDate),
  ];
  added.configuration.budgetOverrides = { groceries: 300 };
  state = editWorkspace(state, added);
  const removed = structuredClone(added);
  removed.configuration.accounts.splice(1, 1);
  state = editWorkspace(state, removed);
  assert.deepEqual(undoWorkspace(state).present, added);
  assert.deepEqual(undoWorkspace(undoWorkspace(state)).present, initial);
  assert.deepEqual(parseWorkspace(serializeWorkspace(state)).present, removed);
});

test("incomplete numeric and text drafts survive reload while configuration imports stay strict", () => {
  const draft = file();
  draft.configuration.incomes[0].amount = NaN;
  draft.configuration.accounts[0].bank = "";
  draft.configuration.startDate = "";
  const restored = parseWorkspace(serializeWorkspace(newWorkspace(draft)));
  assert.ok(Number.isNaN(restored.present.configuration.incomes[0].amount));
  assert.equal(restored.present.configuration.accounts[0].bank, "");
  assert.equal(restored.present.configuration.startDate, "");
  assert.throws(() => parseConfiguration(JSON.stringify(draft)));
});

test("corrupt, unsafe and inconsistent saved edits cannot be restored", () => {
  const initial = newWorkspace(file());
  const changed = structuredClone(initial.present);
  changed.configuration.name = "Changed";
  const valid = JSON.parse(serializeWorkspace(editWorkspace(initial, changed)));
  for (const mutate of [
    (v: any) => {
      v.version = 900;
    },
    (v: any) => {
      delete v.state.present.configuration.accounts;
    },
    (v: any) => {
      v.state.past[0].patches[0].path = ["__proto__", "polluted"];
    },
    (v: any) => {
      v.state.past[0].patches[0].after = "wrong current value";
    },
    (v: any) => {
      v.state.past[0].patches[0].before = {};
    },
  ]) {
    const bad = structuredClone(valid);
    mutate(bad);
    assert.throws(() => parseWorkspace(JSON.stringify(bad)));
  }
  assert.throws(() => parseWorkspace("invalid json"));
  assert.equal(({} as any).polluted, undefined);
});

test("history is bounded and storage failures retain the previous saved workspace", () => {
  let state = newWorkspace(file());
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    const next = structuredClone(state.present);
    next.configuration.name = `Persona ${i}`;
    state = editWorkspace(state, next);
  }
  assert.equal(state.past.length, HISTORY_LIMIT);
  assert.equal(
    parseWorkspace(serializeWorkspace(state)).past.length,
    HISTORY_LIMIT,
  );
  let saved = "previous";
  const smallStorage = {
    setItem(key: string, value: string) {
      assert.equal(key, WORKSPACE_KEY);
      if (JSON.parse(value).state.past.length)
        throw new Error("Quota exceeded");
      saved = value;
    },
  };
  assert.equal(saveWorkspace(smallStorage, state), true);
  assert.deepEqual(parseWorkspace(saved).present, state.present);
  const previous = saved;
  assert.equal(
    saveWorkspace(
      {
        setItem() {
          throw new Error("Storage unavailable");
        },
      },
      state,
    ),
    false,
  );
  assert.equal(saved, previous);
});
