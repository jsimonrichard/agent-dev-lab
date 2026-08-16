import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import type { AdlCliContext } from "../../context";
import { initScaffoldRoot } from "../../paths";
import {
  PLAYGROUND_SOURCE_FILES,
  buildInitGitignore,
  buildInitPackageJson,
  readPlaygroundPackageJson,
  rewritePlaygroundConfigName,
} from "./scaffold";
import { INIT_README, INIT_TSCONFIG } from "./templates";

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

export default async function init(
  this: AdlCliContext,
  flags: Record<string, never>,
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

  const scaffoldRoot = initScaffoldRoot();
  const values = { DISPLAY_NAME: name };
  const files: Array<[string, string]> = [
    ["package.json", buildInitPackageJson(name, readPlaygroundPackageJson(scaffoldRoot))],
    ["tsconfig.json", INIT_TSCONFIG],
    [".gitignore", buildInitGitignore(readFileSync(path.join(scaffoldRoot, ".gitignore"), "utf8"))],
    ["README.md", render(INIT_README, values)],
  ];

  for (const relative of PLAYGROUND_SOURCE_FILES) {
    let contents = readFileSync(path.join(scaffoldRoot, relative), "utf8");
    if (relative === "adl.config.ts") {
      contents = rewritePlaygroundConfigName(contents, name);
    }
    files.push([relative, contents]);
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

  this.process.stdout.write(`Created ADL project "${name}" in ${target}\n`);
  this.process.stdout.write("Next: bun install && add OPENAI_API_KEY to .env && adl dev\n");
}
