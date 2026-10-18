import { migrateCategorySystem } from "./category-migration";
import type { ConfigurationFile } from "../domain/types";
import { checkSchema, fileSchema, legacyCompatibleSchema } from "./schema";

export const WORKSPACE_KEY = "personai.workspace.v1";
export const HISTORY_LIMIT = 50;
const STORAGE_BUDGET = 1_500_000;
type Patch = { path: string[]; before?: unknown; after?: unknown };
type Edit = { patches: Patch[]; group?: string; time: number };
export interface Workspace {
  present: ConfigurationFile;
  past: Edit[];
  future: Edit[];
}
export const newWorkspace = (present: ConfigurationFile): Workspace => ({
  present,
  past: [],
  future: [],
});
const unsafe = new Set(["__proto__", "prototype", "constructor"]);
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

/** Store only changed fields. Large merchant catalogs aren't copied per keystroke. */
function changes(
  before: unknown,
  after: unknown,
  path: string[] = [],
): Patch[] {
  if (Object.is(before, after)) return [];
  if (
    isObject(before) &&
    isObject(after) &&
    Array.isArray(before) === Array.isArray(after) &&
    (!Array.isArray(before) || before.length === after.length)
  ) {
    const patches = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((key) => changes(before[key], after[key], [...path, key]));
    if (!path.length || patches.length <= 100) return patches;
  }
  return [
    { path, before: structuredClone(before), after: structuredClone(after) },
  ];
}
function apply(
  file: ConfigurationFile,
  patches: Patch[],
  direction: "before" | "after",
): ConfigurationFile {
  const next = structuredClone(file);
  for (const patch of patches) {
    if (
      !Array.isArray(patch.path) ||
      !patch.path.length ||
      patch.path.length > 30 ||
      patch.path.some((key) => typeof key !== "string" || unsafe.has(key))
    )
      throw new Error("Invalid saved edit.");
    let target = next as unknown as Record<string, unknown>;
    for (const key of patch.path.slice(0, -1)) {
      if (!Object.hasOwn(target, key) || !isObject(target[key]))
        throw new Error("Invalid saved edit path.");
      target = target[key] as Record<string, unknown>;
    }
    const key = patch.path.at(-1)!;
    if (patch[direction] === undefined) delete target[key];
    else target[key] = structuredClone(patch[direction]);
  }
  return next;
}
export function editWorkspace(
  state: Workspace,
  present: ConfigurationFile,
  group?: string,
  time = Date.now(),
): Workspace {
  const currentChanges = changes(state.present, present);
  if (!currentChanges.length) return state;
  const last = state.past.at(-1);
  const merge =
    !!group &&
    last?.group === group &&
    time - last.time >= 0 &&
    time - last.time < 800 &&
    !state.future.length;
  const base = merge
    ? apply(state.present, last.patches, "before")
    : state.present;
  const patches = merge ? changes(base, present) : currentChanges;
  const past = merge ? state.past.slice(0, -1) : state.past;
  return {
    present,
    past: (patches.length ? [...past, { patches, group, time }] : past).slice(
      -HISTORY_LIMIT,
    ),
    future: [],
  };
}
export function undoWorkspace(state: Workspace): Workspace {
  const edit = state.past.at(-1);
  if (!edit) return state;
  return {
    present: apply(state.present, edit.patches, "before"),
    past: state.past.slice(0, -1).map((e) => ({ ...e, group: undefined })),
    future: [...state.future, { ...edit, group: undefined }],
  };
}
export function redoWorkspace(state: Workspace): Workspace {
  const edit = state.future.at(-1);
  if (!edit) return state;
  return {
    present: apply(state.present, edit.patches, "after"),
    past: [...state.past, { ...edit, group: undefined }],
    future: state.future.slice(0, -1),
  };
}
const encode = (state: Workspace) =>
  JSON.stringify(
    { format: "personai.workspace", version: 1, state },
    (_, value) =>
      typeof value === "number" && !Number.isFinite(value)
        ? { $personaiNumber: String(value) }
        : value,
  );
export function serializeWorkspace(state: Workspace): string {
  const bounded = {
    ...state,
    past: state.past.slice(-HISTORY_LIMIT),
    future: state.future.slice(-HISTORY_LIMIT),
  };
  let text = encode(bounded);
  while (
    text.length > STORAGE_BUDGET &&
    (bounded.past.length || bounded.future.length)
  ) {
    if (bounded.past.length) bounded.past.shift();
    else bounded.future.shift();
    text = encode(bounded);
  }
  return text;
}
function assertDraft(file: unknown): asserts file is ConfigurationFile {
  if (
    checkSchema(
      file,
      (file as ConfigurationFile)?.configuration?.categorySystem === "bridge"
        ? fileSchema
        : legacyCompatibleSchema(fileSchema),
      "",
      true,
    ).length
  )
    throw new Error("Invalid saved configuration.");
}
export function parseWorkspace(text: string): Workspace {
  if (text.length > 5 * 1024 * 1024)
    throw new Error("Saved configuration is too large.");
  const saved = JSON.parse(text, (_, value) => {
    if (
      isObject(value) &&
      Object.keys(value).length === 1 &&
      Object.hasOwn(value, "$personaiNumber")
    ) {
      if (value.$personaiNumber === "NaN") return NaN;
      if (value.$personaiNumber === "Infinity") return Infinity;
      if (value.$personaiNumber === "-Infinity") return -Infinity;
      throw new Error("Invalid saved number.");
    }
    return value;
  });
  if (saved?.format !== "personai.workspace" || saved.version !== 1)
    throw new Error("Unsupported saved configuration.");
  const state = saved.state as Workspace;
  assertDraft(state?.present);
  for (const key of ["past", "future"] as const) {
    if (!Array.isArray(state[key]) || state[key].length > HISTORY_LIMIT)
      throw new Error("Invalid saved history.");
    let file = state.present;
    for (const edit of [...state[key]].reverse()) {
      if (
        !edit ||
        !Array.isArray(edit.patches) ||
        edit.patches.length > 10000 ||
        !Number.isFinite(edit.time) ||
        (edit.group !== undefined && typeof edit.group !== "string")
      )
        throw new Error("Invalid saved edit.");
      const previous = file;
      file = apply(file, edit.patches, key === "past" ? "before" : "after");
      assertDraft(file);
      const reversed = apply(
        file,
        edit.patches,
        key === "past" ? "after" : "before",
      );
      assertDraft(reversed);
      if (changes(previous, reversed).length)
        throw new Error("Inconsistent saved history.");
    }
  }
  return state.present.configuration.categorySystem === "bridge"
    ? state
    : newWorkspace(migrateCategorySystem(state.present));
}
export function saveWorkspace(
  storage: Pick<Storage, "setItem">,
  state: Workspace,
): boolean {
  try {
    storage.setItem(WORKSPACE_KEY, serializeWorkspace(state));
    return true;
  } catch {
    // Keep the current configuration even if the browser has no room for undo history.
    try {
      storage.setItem(WORKSPACE_KEY, encode(newWorkspace(state.present)));
      return true;
    } catch {
      return false;
    }
  }
}
