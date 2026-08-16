import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAYGROUND_PACKAGED_FILES,
  PLAYGROUND_SOURCE_FILES,
} from "../src/commands/init/scaffold-files";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playgroundRoot = path.resolve(cliRoot, "../playground");
const destRoot = path.join(cliRoot, "dist/scaffold");

function fail(message: string): never {
  console.error(`@agent-dev-lab/cli: ${message}`);
  process.exit(1);
}

if (!existsSync(path.join(playgroundRoot, "adl.config.ts"))) {
  fail(`Expected playground project at ${playgroundRoot}`);
}

mkdirSync(destRoot, { recursive: true });

for (const relative of [...PLAYGROUND_SOURCE_FILES, ...PLAYGROUND_PACKAGED_FILES]) {
  const from = path.join(playgroundRoot, relative);
  if (!existsSync(from) || !statSync(from).isFile()) {
    fail(`Missing playground file ${relative} at ${from}`);
  }
  const to = path.join(destRoot, relative);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}

console.log(`@agent-dev-lab/cli: packaged playground scaffold at ${destRoot}`);
