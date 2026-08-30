# CLI scripts (build helpers, not tests)

These files run during `bun run build` / `prebuild`. They are **not** Bun test files.

| Script                 | Role                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `verify-web-output.ts` | Fail the CLI build if `apps/web/.output` is missing (needed for `adl dashboard --serve`). |
| `package-scaffold.ts`  | Copy `apps/cli/scaffold` into `dist/scaffold` for the published `adl init` tree.          |

Unit and e2e tests live under `src/**/*.test.ts` and `src/e2e/`.
