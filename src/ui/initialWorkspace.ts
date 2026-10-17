import { newWorkspace, parseWorkspace } from "../config/workspace";
import { loadModel } from "./format";

/** Restore saved work first; a browser without a configuration starts with André. */
export function initialWorkspace(readSaved: () => string | null) {
  try {
    const saved = readSaved();
    return {
      state: saved ? parseWorkspace(saved) : newWorkspace(loadModel("andre")),
      error: "",
    };
  } catch {
    return {
      state: newWorkspace(loadModel("andre")),
      error:
        "Your saved configuration could not be restored. You can load a configuration file or start editing a new one.",
    };
  }
}
