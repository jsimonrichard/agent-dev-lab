import type { ToolSet } from "ai";

import type { Agent } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";

/**
 * Shape of `adl.config.*` at a project root.
 * Registry arrays are static at load time — see apps/docs (core/project).
 *
 * **Runtime:** set `adl` on the config default export. In project code, import the runtime
 * via a tsconfig path alias (recommended: `#adl` → `./src/adl.ts`). Tooling uses
 * `loadAdlProject().getAdl()` — not the alias.
 */
export interface AdlProjectConfig {
  /** Human-readable project label shown in the inspection UI. */
  name: string;

  /**
   * Process runtime (stores, observers). Set from a dedicated module or inline.
   * Exposed to tooling via `loadAdlProject().getAdl()` / `config.adl`.
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
