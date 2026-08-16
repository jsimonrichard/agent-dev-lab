/** Playground files copied into a new project. `src/main.ts` is playground-only. */
export const PLAYGROUND_SOURCE_FILES = [
  "src/adl.ts",
  "src/agents/researcher.ts",
  "src/agents/critic.ts",
  "src/workflows/demo-counter.ts",
  "src/workflows/literature-review.ts",
  "adl.config.ts",
] as const;

/** Extra playground files packaged with the CLI (versions + gitignore), not copied as-is. */
export const PLAYGROUND_PACKAGED_FILES = ["package.json", ".gitignore"] as const;
