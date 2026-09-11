import type { ToolSet } from "ai";

import type { AnyAgent } from "../agent/types";
import type { AdlRuntime } from "../runtime/types";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";

/**
 * Shape of `adl.config.*` at a project root.
 * Registry arrays are indexed on load and again on {@link LoadedAdlProject.reload}.
 *
 * **Runtime:** set `adl` on the config default export. In project code, import the runtime
 * via a tsconfig path alias (recommended: `#adl` → `./src/adl.ts`). Tooling uses
 * `loadAdlProject().getAdl()` — not the alias.
 */
export interface AdlProjectConfig {
  /** Human-readable project label shown in the inspection UI. */
  name: string;

  /**
   * Process runtime (stores, observers). Set from `src/adl.ts` (recommended) or inline.
   * Exposed to tooling via `loadAdlProject().getAdl()` / `config.adl`.
   */
  adl?: AdlRuntime;

  agents?: AnyAgent[];
  workflows?: Workflow<unknown, unknown>[];
  /** Registry key is `template.name` (filename basename). */
  templates?: Template<unknown>[];
  /**
   * Registry-only shared tools. Runtime merge uses {@link AdlRuntimeConfig.tools}
   * on `createAdlRuntime` — agents are created before this config object is
   * finished loading.
   *
   * Future inspection UI: list these tools and trigger a manual tool run
   * (same idea as starting a workflow) without going through an agent turn.
   */
  tools?: ToolSet;
}

export const ADL_CONFIG_FILENAMES = [
  "adl.config.ts",
  "adl.config.mts",
  "adl.config.js",
  "adl.config.mjs",
  "adl.config.json",
] as const;

export type AdlConfigFilename = (typeof ADL_CONFIG_FILENAMES)[number];

/** When `"1"`, the inspection UI treats the process as framework development. */
export const ADL_FRAMEWORK_DEV_ENV = "ADL_FRAMEWORK_DEV";

/**
 * When `"1"`, file-backed prompt templates re-read from disk on each `render()`.
 * The inspection UI sets `"1"` for a long-lived dashboard and `"0"` for
 * `adl dashboard --serve` (explicit no-watch). Nitro `.output` without that
 * flag still watches — packed `adl dashboard` is not `--serve`.
 */
export const ADL_PROJECT_WATCH_ENV = "ADL_PROJECT_WATCH";

/**
 * Whether a long-lived inspector should arm the project file watcher.
 *
 * `"0"` is the `adl dashboard --serve` opt-out. Unset and `"1"` both watch —
 * packed `adl dashboard` runs Nitro `.output` without passing `--serve`.
 */
export function shouldWatchAdlProject(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ADL_PROJECT_WATCH_ENV] !== "0";
}
