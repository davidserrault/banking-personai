import { useEffect, useRef, useState } from "react";
import SimulationWorker from "../simulation.worker?worker";
import type { ConfigurationFile, ValidationIssue } from "../domain/types";
import type { SimulationResult } from "../engine/types";
import { validateScenario } from "../config";
export type SimulationStatus =
  | "waiting"
  | "running"
  | "ready"
  | "invalid"
  | "error";
export function useSimulation(file: ConfigurationFile) {
  const [state, setState] = useState<{
    status: SimulationStatus;
    issues: ValidationIssue[];
    error?: string;
    result?: SimulationResult;
    resultFile?: ConfigurationFile;
  }>({ status: "waiting", issues: [] });
  const sequence = useRef(0);
  const first = useRef(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const generation = ++sequence.current;
    let worker: Worker | undefined;
    let disposed = false;
    setState((s) => ({
      ...s,
      status: "waiting",
      issues: [],
      error: undefined,
    }));
    const start = () => {
      first.current = false;
      const issues = validateScenario(
        file.configuration,
        file.reference,
        file.assumptions,
      );
      if (issues.length) {
        setState((s) => ({ ...s, status: "invalid", issues }));
        return;
      }
      setState((s) => ({ ...s, status: "running", issues: [] }));
      try {
        worker = new SimulationWorker();
        worker.onmessage = (event) => {
          if (disposed || sequence.current !== generation) return;
          if (event.data.error)
            setState((s) => ({
              ...s,
              status: "error",
              error: event.data.error,
            }));
          else
            setState({
              status: "ready",
              result: event.data.result,
              resultFile: file,
              issues: [],
            });
          worker?.terminate();
        };
        worker.onerror = (event) => {
          if (!disposed && sequence.current === generation)
            setState((s) => ({ ...s, status: "error", error: event.message }));
          worker?.terminate();
        };
        worker.postMessage({
          config: file.configuration,
          reference: file.reference,
          assumptions: file.assumptions,
        });
      } catch (error) {
        setState((s) => ({ ...s, status: "error", error: String(error) }));
      }
    };
    const delay = first.current ? 0 : 250;
    const timer = setTimeout(start, delay);
    return () => {
      disposed = true;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [file, retry]);
  const current = state.resultFile === file && state.status === "ready";
  return {
    ...state,
    current,
    status:
      state.status === "ready" && !current
        ? ("waiting" as const)
        : state.status,
    retry: () => setRetry((x) => x + 1),
  };
}
