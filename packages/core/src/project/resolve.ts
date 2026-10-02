import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AnyAgent } from "../agent/types";
import { AdlError } from "../errors";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";
import {
  ADL_CONFIG_FILENAMES,
  type AdlConfigFilename,
  type AdlModelCatalogEntry,
  type AdlProjectConfig,
} from "./config";
import { importAdlConfigModule, invalidateAdlConfigCache } from "./load-config";
import { loadAdlProjectEnv } from "./load-env";
import { pinRuntimeStores } from "./pin-stores";
import { disposeRegistryProviders } from "./dispose-providers";

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

/**
 * Walks upward from `cwd` to find a directory containing `adl.config.*`.
 * Used by the CLI and inspection UI when no explicit project root is set.
 */
export function findAdlProjectRootFromCwd(cwd: string = process.cwd()): string {
  let dir = path.resolve(cwd);
  const fsRoot = path.parse(dir).root;

  while (true) {
    if (findAdlConfigPath(dir)) {
      return dir;
    }
    if (dir === fsRoot) {
      break;
    }
    dir = path.dirname(dir);
  }

  throw new AdlError(
    "PROJECT_NOT_FOUND",
    `No ADL project found from ${cwd}. Run from a project directory containing adl.config.*, or pass --project.`,
  );
}

export interface LoadedAdlProject {
  readonly root: string;
  readonly configPath: string;
  readonly generation: number;
  readonly lastReloadError: string | null;
  readonly config: AdlProjectConfig;

  /**
   * Re-import `adl.config.*` and swap agents/workflows/templates while pinning stores.
   * On failure the previous registry is kept and {@link lastReloadError} is set.
   * On success, {@link ToolProvider.dispose} is called on outgoing registry providers.
   */
  reload(): Promise<void>;

  /**
   * Release resources held by the *current* registry's tool providers. Idempotent.
   * Used by process-host reset / project unload; also safe for tests.
   */
  dispose(): Promise<void>;

  /**
   * Process runtime from `adl.config` (`config.adl`).
   * CLI, inspection UI, and scripts should use this — not import a project runtime file directly.
   */
  getAdl(): NonNullable<AdlProjectConfig["adl"]>;

  getWorkflow(id: string): Workflow<unknown, unknown> | undefined;
  getAgent(id: string): AnyAgent | undefined;
  listWorkflowIds(): string[];
  listAgentIds(): string[];
  getTemplate(name: string): Template<unknown> | undefined;
  listTemplateNames(): string[];
  /** Host-only catalog entry; core never uses this during agent resolution. */
  getModel(id: string): AdlModelCatalogEntry | undefined;
  listModelIds(): string[];
}

type ProjectIndexes = {
  workflowById: Map<string, Workflow<unknown, unknown>>;
  agentById: Map<string, AnyAgent>;
  templateByName: Map<string, Template<unknown>>;
  modelById: Map<string, AdlModelCatalogEntry>;
};

type ProjectState = {
  config: AdlProjectConfig;
  configFilename: AdlConfigFilename;
  generation: number;
  lastReloadError: string | null;
} & ProjectIndexes;

/**
 * Loads `adl.config.*` from `projectRoot` via dynamic import (TS/JS) or JSON parse.
 *
 * Before evaluating the config, Next.js-style `.env*` files at the project root are
 * applied to `process.env` (existing values are not overwritten).
 */
export async function loadAdlProject(options?: {
  root?: string;
  cwd?: string;
}): Promise<LoadedAdlProject> {
  const root = resolveProjectRoot(options);
  loadAdlProjectEnv(root);
  const configFilename = findAdlConfigPath(root);
  if (!configFilename) {
    throw new AdlError(
      "PROJECT_NOT_FOUND",
      `No ADL project config found in ${root}. Expected one of: ${ADL_CONFIG_FILENAMES.join(", ")}`,
    );
  }

  const configPath = path.join(root, configFilename);
  const config = await loadConfigModule(configPath, configFilename);
  return buildLoadedProject({ root, configPath, config, configFilename });
}

async function loadConfigModule(
  configPath: string,
  filename: string,
  options?: { bustCache?: boolean },
): Promise<AdlProjectConfig> {
  if (filename.endsWith(".json")) {
    const raw = await readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return normalizeConfig(parsed, configPath);
  }

  const exported = await importAdlConfigModule(configPath, options);
  return normalizeConfig(exported, configPath);
}

function normalizeConfig(value: unknown, configPath: string): AdlProjectConfig {
  if (!value || typeof value !== "object" || !("name" in value)) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: expected an object with a string "name" field`,
    );
  }
  const record = value as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: "name" must be a non-empty string`,
    );
  }

  const agents = record.agents;
  const workflows = record.workflows;
  const templates = record.templates;
  const models = record.models;

  if (agents !== undefined && !Array.isArray(agents)) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: "agents" must be an array`,
    );
  }
  if (workflows !== undefined && !Array.isArray(workflows)) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: "workflows" must be an array`,
    );
  }
  if (templates !== undefined && !Array.isArray(templates)) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: "templates" must be an array`,
    );
  }
  if (models !== undefined && !Array.isArray(models)) {
    throw new AdlError(
      "INVALID_CONFIG",
      `Invalid ADL config at ${configPath}: "models" must be an array`,
    );
  }

  return {
    name,
    adl: record.adl as AdlProjectConfig["adl"],
    agents: agents as AdlProjectConfig["agents"],
    workflows: workflows as AdlProjectConfig["workflows"],
    templates: templates as AdlProjectConfig["templates"],
    models: models as AdlProjectConfig["models"],
    tools: record.tools as AdlProjectConfig["tools"],
  };
}

function buildIndexes(config: AdlProjectConfig, configPath: string): ProjectIndexes {
  return {
    workflowById: indexById(config.workflows ?? [], "workflow"),
    agentById: indexById(config.agents ?? [], "agent"),
    templateByName: indexTemplates(config.templates ?? [], configPath),
    modelById: indexModels(config.models ?? [], configPath),
  };
}

function attachProjectRoot(config: AdlProjectConfig, root: string): void {
  if (config.adl) {
    config.adl.services.projectRoot = root;
  }
}

function buildLoadedProject(parts: {
  root: string;
  configPath: string;
  config: AdlProjectConfig;
  configFilename: AdlConfigFilename;
}): LoadedAdlProject {
  attachProjectRoot(parts.config, parts.root);

  const state: ProjectState = {
    config: parts.config,
    configFilename: parts.configFilename,
    generation: 0,
    lastReloadError: null,
    ...buildIndexes(parts.config, parts.configPath),
  };

  let reloadPromise: Promise<void> | null = null;
  let disposed = false;

  const project: LoadedAdlProject = {
    root: parts.root,
    configPath: parts.configPath,
    get config() {
      return state.config;
    },
    get generation() {
      return state.generation;
    },
    get lastReloadError() {
      return state.lastReloadError;
    },
    getAdl() {
      if (!state.config.adl) {
        throw new AdlError(
          "MISSING_RUNTIME",
          `ADL project config at ${parts.configPath} is missing \`adl\`. Export createAdlRuntime() as config.adl.`,
        );
      }
      return state.config.adl;
    },
    getWorkflow(id) {
      return state.workflowById.get(id);
    },
    getAgent(id) {
      return state.agentById.get(id);
    },
    listWorkflowIds() {
      return [...state.workflowById.keys()];
    },
    listAgentIds() {
      return [...state.agentById.keys()];
    },
    getTemplate(name) {
      return state.templateByName.get(name);
    },
    listTemplateNames() {
      return [...state.templateByName.keys()];
    },
    getModel(id) {
      return state.modelById.get(id);
    },
    listModelIds() {
      return [...state.modelById.keys()];
    },
    reload() {
      if (reloadPromise) {
        return reloadPromise;
      }
      reloadPromise = performReload().finally(() => {
        reloadPromise = null;
      });
      return reloadPromise;
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      await disposeRegistryProviders(state.config);
    },
  };

  async function performReload(): Promise<void> {
    invalidateAdlConfigCache(parts.root);
    let previousConfig: AdlProjectConfig | null = null;
    try {
      const nextConfig = await loadConfigModule(parts.configPath, state.configFilename, {
        bustCache: true,
      });
      previousConfig = state.config;
      pinRuntimeStores(previousConfig, nextConfig);
      attachProjectRoot(nextConfig, parts.root);
      const indexes = buildIndexes(nextConfig, parts.configPath);
      state.config = nextConfig;
      state.workflowById = indexes.workflowById;
      state.agentById = indexes.agentById;
      state.templateByName = indexes.templateByName;
      state.modelById = indexes.modelById;
      state.generation += 1;
      state.lastReloadError = null;
      disposed = false;
    } catch (error) {
      state.lastReloadError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    // After a successful swap only — a failed dispose must not keep the old registry live.
    await disposeRegistryProviders(previousConfig);
  }

  return project;
}

function indexById<T extends { id: string }>(
  items: T[],
  kind: "workflow" | "agent",
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!item?.id || typeof item.id !== "string") {
      throw new Error(`Invalid ${kind}: each entry must have a non-empty string "id"`);
    }
    if (map.has(item.id)) {
      throw new Error(`Duplicate ${kind} id "${item.id}" in adl.config`);
    }
    map.set(item.id, item);
  }
  return map;
}

function indexTemplates(
  templates: Template<unknown>[],
  configPath: string,
): Map<string, Template<unknown>> {
  const map = new Map<string, Template<unknown>>();
  for (const template of templates) {
    if (!template?.name || typeof template.name !== "string") {
      throw new Error(
        `Invalid template in ${configPath}: expected a "name" from the template path`,
      );
    }
    if (map.has(template.name)) {
      throw new Error(`Duplicate template name "${template.name}" in adl.config`);
    }
    map.set(template.name, template);
  }
  return map;
}

function indexModels(
  models: AdlModelCatalogEntry[],
  configPath: string,
): Map<string, AdlModelCatalogEntry> {
  const map = new Map<string, AdlModelCatalogEntry>();
  for (const entry of models) {
    if (!entry || typeof entry !== "object") {
      throw new AdlError(
        "INVALID_CONFIG",
        `Invalid model catalog entry in ${configPath}: expected an object`,
      );
    }
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      throw new AdlError(
        "INVALID_CONFIG",
        `Invalid model catalog entry in ${configPath}: each entry must have a non-empty string "id"`,
      );
    }
    if (typeof entry.label !== "string" || entry.label.trim().length === 0) {
      throw new AdlError(
        "INVALID_CONFIG",
        `Invalid model catalog entry "${entry.id}" in ${configPath}: "label" must be a non-empty string`,
      );
    }
    if (typeof entry.provider !== "string" || entry.provider.trim().length === 0) {
      throw new AdlError(
        "INVALID_CONFIG",
        `Invalid model catalog entry "${entry.id}" in ${configPath}: "provider" must be a non-empty string`,
      );
    }
    if (typeof entry.factory !== "function") {
      throw new AdlError(
        "INVALID_CONFIG",
        `Invalid model catalog entry "${entry.id}" in ${configPath}: "factory" must be a function (JSON configs cannot supply factories — omit models)`,
      );
    }
    if (entry.apiKeyEnv !== undefined) {
      if (typeof entry.apiKeyEnv !== "string" || entry.apiKeyEnv.trim().length === 0) {
        throw new AdlError(
          "INVALID_CONFIG",
          `Invalid model catalog entry "${entry.id}" in ${configPath}: "apiKeyEnv" must be a non-empty string when set`,
        );
      }
    }
    if (map.has(entry.id)) {
      throw new AdlError(
        "INVALID_CONFIG",
        `Duplicate model catalog id "${entry.id}" in adl.config`,
      );
    }
    map.set(entry.id, entry);
  }
  return map;
}
