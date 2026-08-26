import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ToolSet } from "ai";

import type { Agent } from "../agent/types";
import { AdlError } from "../errors";
import type { Template } from "../template/types";
import type { Workflow } from "../workflow/types";
import { ADL_CONFIG_FILENAMES, type AdlConfigFilename, type AdlProjectConfig } from "./config";
import { importAdlConfigModule } from "./load-config";
import { loadAdlProjectEnv } from "./load-env";

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
  root: string;
  configPath: string;
  config: AdlProjectConfig;

  /**
   * Process runtime from `adl.config` (`config.adl`).
   * CLI, inspection UI, and scripts should use this — not import a project runtime file directly.
   */
  getAdl(): NonNullable<AdlProjectConfig["adl"]>;

  getWorkflow(id: string): Workflow<unknown, unknown> | undefined;
  getAgent(id: string): Agent<unknown, ToolSet, unknown> | undefined;
  listWorkflowIds(): string[];
  listAgentIds(): string[];
  getTemplate(name: string): Template<unknown> | undefined;
  listTemplateNames(): string[];
}

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
  return buildLoadedProject({ root, configPath, config });
}

async function loadConfigModule(configPath: string, filename: string): Promise<AdlProjectConfig> {
  if (filename.endsWith(".json")) {
    const raw = await readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return normalizeConfig(parsed, configPath);
  }

  const exported = await importAdlConfigModule(configPath);
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

  return {
    name,
    adl: record.adl as AdlProjectConfig["adl"],
    agents: agents as AdlProjectConfig["agents"],
    workflows: workflows as AdlProjectConfig["workflows"],
    templates: templates as AdlProjectConfig["templates"],
    tools: record.tools as AdlProjectConfig["tools"],
  };
}

function buildLoadedProject(parts: {
  root: string;
  configPath: string;
  config: AdlProjectConfig;
}): LoadedAdlProject {
  const workflowById = indexById(parts.config.workflows ?? [], "workflow");
  const agentById = indexById(parts.config.agents ?? [], "agent");
  const templateByName = indexTemplates(parts.config.templates ?? [], parts.configPath);

  return {
    ...parts,
    getAdl() {
      if (!parts.config.adl) {
        throw new AdlError(
          "MISSING_RUNTIME",
          `ADL project config at ${parts.configPath} is missing \`adl\`. Export createAdlRuntime() as config.adl.`,
        );
      }
      return parts.config.adl;
    },
    getWorkflow(id) {
      return workflowById.get(id);
    },
    getAgent(id) {
      return agentById.get(id);
    },
    listWorkflowIds() {
      return [...workflowById.keys()];
    },
    listAgentIds() {
      return [...agentById.keys()];
    },
    getTemplate(name) {
      return templateByName.get(name);
    },
    listTemplateNames() {
      return [...templateByName.keys()];
    },
  };
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
