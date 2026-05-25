import { readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = join(import.meta.dirname, "..");
const publicEntrypoints = ["dist/index.d.ts", "dist/project/index.d.ts"] as const;

/** Symbols that must not appear on public package entrypoint declarations. */
const forbiddenSymbols = [
  "WorkflowRunEventChannel",
  "WorkflowContextImpl",
  "getWorkflowImpl",
  "peekWorkflowContext",
  "runWithActiveWorkflowContext",
  "createWorkflowContext",
  "refreshWorkflowContext",
  "asWorkflowContextImpl",
  "executeRun",
  "runNested",
] as const;

let failed = false;

for (const entry of publicEntrypoints) {
  const path = join(packageRoot, entry);
  const contents = readFileSync(path, "utf8");
  for (const symbol of forbiddenSymbols) {
    const pattern = new RegExp(`\\b${symbol}\\b`);
    if (pattern.test(contents)) {
      console.error(`${entry}: internal symbol "${symbol}" leaked into public API`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("@agent-dev-lab/core: public API entrypoints verified");
