/** Files copied into a new project from the dedicated CLI scaffold. */
export const SCAFFOLD_SOURCE_FILES = [
  "src/adl.ts",
  "src/env.ts",
  "src/model.ts",
  "src/agents/assistant.ts",
  "src/workflows/demo-counter.ts",
  "src/workflows/ask.ts",
  "adl.config.ts",
  ".env.example",
] as const;

/** Extra scaffold files packaged with the CLI (versions + gitignore), not copied as-is. */
export const SCAFFOLD_PACKAGED_FILES = ["package.json", ".gitignore"] as const;
