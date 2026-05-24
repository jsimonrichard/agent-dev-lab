/**
 * Shape of `adl.config.*` at a project root. Fields will grow with the agent SDK;
 * keep this surface environment-agnostic so the same file works in Bun, Node, Deno, etc.
 */
export interface AdlProjectConfig {
  /** Human-readable project label shown in the inspection UI. */
  name: string;
}

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
