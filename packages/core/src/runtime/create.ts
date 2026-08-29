import { loadAdlEnv } from "../project/load-env";
import { AdlRuntimeImpl } from "./adl-runtime";
import type { AdlRuntime, AdlRuntimeConfig } from "./types";

export type { AdlRuntime } from "./types";

function applyRuntimeLoadEnv(loadEnv: AdlRuntimeConfig["loadEnv"]): void {
  if (loadEnv === false) {
    return;
  }
  const options = loadEnv === true || loadEnv === undefined ? {} : loadEnv;
  loadAdlEnv(options);
}

/** Creates the process-level ADL runtime (wrapper over {@link AdlRuntimeImpl}). */
export function createAdlRuntime(config: AdlRuntimeConfig = {}): AdlRuntime {
  applyRuntimeLoadEnv(config.loadEnv);
  const runtimeConfig = { ...config };
  delete runtimeConfig.loadEnv;
  return new AdlRuntimeImpl(runtimeConfig);
}
