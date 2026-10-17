import { generate } from "./engine";
import type { ConfigurationFile } from "./domain/types";
self.onmessage = (
  event: MessageEvent<{
    config: ConfigurationFile["configuration"];
    reference: ConfigurationFile["reference"];
    assumptions: ConfigurationFile["assumptions"];
  }>,
) => {
  try {
    self.postMessage({
      result: generate(
        event.data.config,
        event.data.reference,
        event.data.assumptions,
      ),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
