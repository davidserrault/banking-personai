import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace } from "../src/ui/initialWorkspace";
import { loadModel } from "../src/ui/format";
import {
  editWorkspace,
  newWorkspace,
  serializeWorkspace,
  undoWorkspace,
} from "../src/config/workspace";

test("first visit without saved configuration selects the complete André model", () => {
  const initial = initialWorkspace(() => null);
  assert.deepEqual(initial.state, newWorkspace(loadModel("andre")));
  assert.equal(initial.state.present.configuration.name, "André");
  assert.equal(initial.error, "");
});

test("a returning visitor restores their saved configuration and edits instead of André", () => {
  const saved = newWorkspace(loadModel("nicolas"));
  const edited = structuredClone(saved.present);
  edited.configuration.name = "My saved persona";
  edited.configuration.accounts[0].openingBalance = 1234.56;
  const workspace = editWorkspace(saved, edited);
  const initial = initialWorkspace(() => serializeWorkspace(workspace));
  assert.deepEqual(initial.state.present, edited);
  assert.deepEqual(undoWorkspace(initial.state).present, saved.present);
  assert.equal(initial.error, "");
});

test("unreadable browser storage falls back to André with a restoration warning", () => {
  for (const readSaved of [
    () => "invalid JSON",
    (): string | null => {
      throw new Error("Storage unavailable");
    },
  ]) {
    const initial = initialWorkspace(readSaved);
    assert.deepEqual(initial.state, newWorkspace(loadModel("andre")));
    assert.ok(initial.error);
  }
});
