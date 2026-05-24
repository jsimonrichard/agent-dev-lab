import type { ToolSet } from "ai";

import type { Agent } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";

/**
 * Shape of `adl.config.*` at a project root.
 * Registry arrays are static at load time — see notes/project-api.md.
 *
 * **Runtime:** export `adl` from `src/adl.ts` and reference it here for the CLI.
 * Do not construct stores/observers in this file (import-cycle safe).
 */
export interface AdlProjectConfig {
  /** Human-readable project label shown in the inspection UI. */
  name: string;

  /**
   * Process runtime (stores, observers). Convention: `import { adl } from "./src/adl"`.
   * Required for CLI execution paths that run workflows/agents.
   */
  adl?: AdlRuntime;

  agents?: Agent<unknown, ToolSet>[];
  workflows?: Workflow<unknown, unknown>[];
  /** Registry key is `template.name` (filename basename). */
  templates?: Template<unknown>[];
  tools?: ToolSet;

  defaults?: AdlProjectDefaults;
}

/** Optional project-wide defaults (model router, etc.) — TBD. */
export type AdlProjectDefaults = Record<string, unknown>;

export const ADL_CONFIG_FILENAMES = [
  "adl.config.ts",
  "adl.config.mts",
  "adl.config.js",
  "adl.config.mjs",
  "adl.config.json",
] as const;

export type AdlConfigFilename = (typeof ADL_CONFIG_FILENAMES)[number];

/** When `"1"`, the inspection UI runs in framework dev mode (playground default). */
export const ADL_FRAMEWORK_DEV_ENV = "ADL_FRAMEWORK_DEV";
