import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import type { AdlCliContext } from "../../context";
import { adlMonorepoRootFromCli, initScaffoldRoot, isAdlCliSourceCheckout } from "../../paths";
import type { InitFlags } from "./command";
import {
  listScaffoldSourceFiles,
  assertLocalInitAllowed,
  buildInitGitignore,
  buildInitPackageJson,
  readScaffoldPackageJson,
  rewriteScaffoldConfigName,
} from "./scaffold";

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

export default async function init(
  this: AdlCliContext,
  flags: InitFlags,
  dir: string,
): Promise<void> {
  const target = path.resolve(this.process.cwd(), dir);
  const name = path.basename(target);
  if (!name || name === "." || name === "/") {
    throw new AdlError("INIT_FAILED", "Could not determine a project name for this directory.");
  }

  if (existsSync(path.join(target, "adl.config.ts"))) {
    throw new AdlError("INIT_FAILED", `An ADL project already exists in ${target}`);
  }

  if (flags.git) {
    const probe = existsSync(target) ? target : path.dirname(target);
    if (isInsideGitWorkTree(probe)) {
      throw new AdlError(
        "INIT_FAILED",
        `${target} is already inside a Git repository. Omit --git, or init in a directory that is not a work tree.`,
      );
    }
  }

  let localRoot: string | undefined;
  if (flags.local) {
    assertLocalInitAllowed(isAdlCliSourceCheckout());
    localRoot = adlMonorepoRootFromCli();
  }

  const scaffoldRoot = initScaffoldRoot();
  const values = { DISPLAY_NAME: name };
  const files: Array<[string, string]> = [
    [
      "package.json",
      buildInitPackageJson(name, readScaffoldPackageJson(scaffoldRoot), { localRoot }),
    ],
    [".gitignore", buildInitGitignore(readFileSync(path.join(scaffoldRoot, "gitignore"), "utf8"))],
  ];
  if (localRoot) {
    // Bun's isolated linker leaves empty directories for `file:` workspace
    // packages; hoisted linking is required for `adl init --local`.
    files.push(["bunfig.toml", '[install]\nlinker = "hoisted"\n']);
  }

  for (const relative of listScaffoldSourceFiles(scaffoldRoot)) {
    let contents = readFileSync(path.join(scaffoldRoot, relative), "utf8");
    if (relative === "adl.config.ts") {
      contents = rewriteScaffoldConfigName(contents, name);
    }
    files.push([relative, render(contents, values)]);
  }

  for (const [relative, contents] of files) {
    const fullPath = path.join(target, relative);
    if (existsSync(fullPath) && relative === "package.json") {
      throw new AdlError(
        "INIT_FAILED",
        `${fullPath} already exists. Use an empty directory or omit existing package.json.`,
      );
    }
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }

  if (flags.git) {
    initGitRepository(target);
  }

  this.process.stdout.write(`Created ADL project "${name}" in ${target}\n`);
  if (flags.git) {
    this.process.stdout.write(`Initialized a Git repository in ${target}\n`);
  }
  this.process.stdout.write("Next: bun install && add OPENAI_API_KEY to .env && bun run dev\n");
}

/**
 * `adl init` does not create a VCS repository unless `--git` is passed.
 * jj and other tools are valid; Git is opt-in, not a default.
 *
 * Refuses when `target` is already inside a Git work tree so `--git` cannot
 * nest a second repository. A missing `git` binary is an error, not a skip.
 */
function initGitRepository(target: string): void {
  if (isInsideGitWorkTree(target)) {
    throw new AdlError(
      "INIT_FAILED",
      `${target} is already inside a Git repository. Omit --git, or init in a directory that is not a work tree.`,
    );
  }
  try {
    execFileSync("git", ["init"], {
      cwd: target,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AdlError("INIT_FAILED", `git init failed in ${target}: ${detail}`, { cause: error });
  }
}

function isInsideGitWorkTree(cwd: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      timeout: 30_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
