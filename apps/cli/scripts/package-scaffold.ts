/**
 * Build helper (not a test): copies `apps/cli/scaffold` into `dist/scaffold`
 * so the published CLI can run `adl init` without the monorepo tree.
 *
 * Invoked by `bun run package-scaffold` after tsup.
 */
import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  listScaffoldSourceFiles,
  SCAFFOLD_PACKAGED_FILES,
} from "../src/commands/init/scaffold-files";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scaffoldRoot = path.join(cliRoot, "scaffold");
const destRoot = path.join(cliRoot, "dist/scaffold");

function fail(message: string): never {
  console.error(`@agent-dev-lab/cli: ${message}`);
  process.exit(1);
}

if (!existsSync(path.join(scaffoldRoot, "adl.config.ts"))) {
  fail(`Expected init scaffold at ${scaffoldRoot}`);
}

mkdirSync(destRoot, { recursive: true });

for (const relative of [...listScaffoldSourceFiles(scaffoldRoot), ...SCAFFOLD_PACKAGED_FILES]) {
  const from = path.join(scaffoldRoot, relative);
  if (!existsSync(from) || !statSync(from).isFile()) {
    fail(`Missing scaffold file ${relative} at ${from}`);
  }
  const to = path.join(destRoot, relative);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}

console.log(`@agent-dev-lab/cli: packaged init scaffold at ${destRoot}`);
