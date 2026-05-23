import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ADL_CONFIG_FILENAMES, type AdlConfigFilename, type AdlProjectConfig } from "./config.js";

export const ADL_PROJECT_ROOT_ENV = "ADL_PROJECT_ROOT";

/**
 * Resolves the ADL project directory: explicit `root`, then `ADL_PROJECT_ROOT`, then `cwd`.
 */
export function resolveProjectRoot(options?: { root?: string; cwd?: string }): string {
  const cwd = options?.cwd ?? process.cwd();
  const fromEnv = process.env[ADL_PROJECT_ROOT_ENV];
  const candidate = options?.root ?? fromEnv ?? cwd;
  return path.resolve(candidate);
}

export function findAdlConfigPath(projectRoot: string): AdlConfigFilename | null {
  for (const filename of ADL_CONFIG_FILENAMES) {
    const fullPath = path.join(projectRoot, filename);
    if (existsSync(fullPath)) {
      return filename;
    }
  }
  return null;
}

export interface LoadedAdlProject {
  root: string;
  configPath: string;
  config: AdlProjectConfig;
}

/**
 * Loads `adl.config.*` from `projectRoot` via dynamic import (TS/JS) or JSON parse.
 */
export async function loadAdlProject(options?: {
  root?: string;
  cwd?: string;
}): Promise<LoadedAdlProject> {
  const root = resolveProjectRoot(options);
  const configFilename = findAdlConfigPath(root);
  if (!configFilename) {
    throw new Error(
      `No ADL project config found in ${root}. Expected one of: ${ADL_CONFIG_FILENAMES.join(", ")}`,
    );
  }

  const configPath = path.join(root, configFilename);
  const config = await loadConfigModule(configPath, configFilename);
  return { root, configPath, config };
}

async function loadConfigModule(configPath: string, filename: string): Promise<AdlProjectConfig> {
  if (filename.endsWith(".json")) {
    const raw = await readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return normalizeConfig(parsed, configPath);
  }

  const mod: { default?: unknown } = await import(
    /* @vite-ignore */ pathToFileURL(configPath).href
  );
  const exported = mod.default ?? mod;
  return normalizeConfig(exported, configPath);
}

function normalizeConfig(value: unknown, configPath: string): AdlProjectConfig {
  if (!value || typeof value !== "object" || !("name" in value)) {
    throw new Error(
      `Invalid ADL config at ${configPath}: expected an object with a string "name" field`,
    );
  }
  const name = (value as { name: unknown }).name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Invalid ADL config at ${configPath}: "name" must be a non-empty string`);
  }
  return { name };
}
