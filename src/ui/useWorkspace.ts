import { useLayoutEffect, useRef, useState, type SetStateAction } from "react";
import type { ConfigurationFile } from "../domain/types";
import {
  WORKSPACE_KEY,
  editWorkspace,
  undoWorkspace,
  redoWorkspace,
  saveWorkspace,
} from "../config/workspace";
import { initialWorkspace } from "./initialWorkspace";

export function useWorkspace() {
  const [initial] = useState(() =>
    initialWorkspace(() => window.localStorage.getItem(WORKSPACE_KEY)),
  );
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const lastSaved = useRef<typeof state | undefined>(undefined);
  useLayoutEffect(() => {
    if (
      lastSaved.current === state ||
      (initial.error && state === initial.state)
    )
      return;
    let saved = false;
    try {
      saved = saveWorkspace(window.localStorage, state);
    } catch {}
    if (saved) lastSaved.current = state;
    setStorageError(
      saved
        ? ""
        : "Changes could not be saved in this browser. Download your configuration before closing this page.",
    );
  }, [state, initial]);
  const setFile = (update: SetStateAction<ConfigurationFile>) => {
    const active = document.activeElement;
    const group =
      active instanceof HTMLInputElement &&
      ["text", "number", "range", "date"].includes(active.type)
        ? active.id
        : undefined;
    const time = Date.now();
    setState((previous) =>
      editWorkspace(
        previous,
        typeof update === "function" ? update(previous.present) : update,
        group,
        time,
      ),
    );
  };
  return {
    file: state.present,
    setFile,
    storageError,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
    undo: () => setState(undoWorkspace),
    redo: () => setState(redoWorkspace),
  };
}
