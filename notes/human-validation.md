# Human validation

Reusable checklist before a publish. Not linked from the docs site.

Published packages (2026-09-22): **core/web 0.0.6**, **cli 0.0.8**, **tools 0.0.3**.

Opening a pre-migration SQLite file runs `2026-09-path-stable-step-slots`, which **deletes `adl_step_outputs`**. Events stay; step skip cache is empty until new runs. Use a copy of any database you still need step outputs from.

## Automated

From the repo root: `bun install`, then `lint`, `format:check`, `typecheck`, `test`, `test:node`, `build`. CLI e2e (`init-smoke` + `init-pack`) is part of `apps/cli`'s `bun test src`. Web Playwright (`bun run test:e2e`) covers:

- Fixture chat streaming plus `retry-attempt.spec.ts` (running-forest 409, workflow-row Retry, API `retriesFromRunId`, nested `parentStepId` patch, collapse/expand).
- **Fresh-project packed suite** (`playwright.fresh-project.config.ts`): `pack:local` into a tmp consumer, Node Nitro dashboard with watch on — `#adl` / `.env.example` / SQLite, start `demo-counter` via the JSON editor, reopen the run, event log, start-run errors in the UI, and hot-reload success + failed banner. It does not cover copied-bar layout, nested expand spinners, or playground API-key workflows.

`workflow-tree-inp.bench.spec.ts` is local-only (`ADL_INP_BENCH=1`), not CI. API-only pack and watch coverage stays in CLI `init-pack` and `packages/core` `watch.e2e.test.ts`.

## Fresh project

Covered by the packed Playwright suite above. Manual fallback:

```bash
bun apps/cli/src/bin/cli.ts init /tmp/adl-validate --local
cd /tmp/adl-validate
bun install
cp .env.example .env
adl workflow run demo-counter --input '{"steps":3}'   # sum 6
adl dashboard
```

## Playground (API key)

`bun run dev:web` — `answer-question`, `literature-review`, `write-article`, `shared-scope` (prompt-conflict warning), `nested-demo` (expand nested runs in the tree/waterfall; Non-Root toggle), new chat title after first turn, fork, edit a workflow (sidebar refresh / failed-reload banner), Cancel on a long run. After a failed nested step: Retry / Retry from here seeds a new attempt (prior run stays listed).

## Watch vs `--serve`

- Packed dashboard hot-reload (watch on, UI banner on failure) is covered by the fresh-project Playwright suite.
- `--serve` / `ADL_PROJECT_WATCH=0` opt-out stays in `packages/core` `watch.e2e.test.ts` (API-only).
- Default dashboard prints `[adl] watching` and reloads registry edits. `.env*` always needs a restart.
- **Warm navigations must stay cheap:** after the first `/workflows` (or `/api/project`), repeat loads should not re-import the project module graph or re-scan the full event store into the in-memory log. If page loads climb toward multi-second with growing `node_modules`/sqlite history, the process-host memo or one-shot event-log hydrate regressed. Not asserted in Playwright.

## Docs

Follow [Project setup](../apps/docs/src/content/docs/guides/project-setup.md) on a new folder. File every step that does not work.

## Packed Node path

Covered by the fresh-project Playwright suite (Node `cli.js` dashboard, no Bun relaunch) and CLI `init-pack` (CLI `workflow run` + `--serve` API smoke).

## Publish

Remaining `.changeset/*.md` drive the next Version Packages PR (`.github/workflows/release.yml`); merging that PR publishes core, tools, cli, and web. Do not link `notes/` from product docs. npm OIDC trusted publishing must include all four packages for this repo/`release.yml`.
