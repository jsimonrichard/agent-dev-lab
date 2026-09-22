# Human validation

Reusable checklist before a publish. Not linked from the docs site.

Published packages (2026-09-16): **core/web 0.0.5**, **cli 0.0.7**, **tools 0.0.2**. Pending changesets are all patches, so core and web go to **0.0.6**. `updateInternalDependencies: patch` still republishes **cli** and **tools** as dependency bumps.

Opening a pre-migration SQLite file runs `2026-09-path-stable-step-slots`, which **deletes `adl_step_outputs`**. Events stay; step skip cache is empty until new runs. Use a copy of any database you still need step outputs from.

## Automated

From the repo root: `bun install`, then `lint`, `format:check`, `typecheck`, `test`, `test:node`, `build`. CLI e2e (`init-smoke` + `init-pack`) is part of `apps/cli`'s `bun test src`. Web Playwright (`bun run test:e2e`) covers chat streaming plus `retry-attempt.spec.ts` (running-forest 409, workflow-row Retry, API `retriesFromRunId`, nested `parentStepId` patch, collapse/expand). It does not cover copied-bar layout, nested expand spinners, or the start-workflow JSON editor. `workflow-tree-inp.bench.spec.ts` is local-only (`ADL_INP_BENCH=1`), not CI. Packed e2e covers Node + `better-sqlite3`.

## Fresh project

```bash
bun apps/cli/src/bin/cli.ts init /tmp/adl-validate --local
cd /tmp/adl-validate
bun install
cp .env.example .env
adl workflow run demo-counter --input '{"steps":3}'   # sum 6
adl dashboard
```

Confirm `#adl` imports, `.env.example`, SQLite under `.data/`. In the UI: start demo-counter, reopen the run, event-log deep-link, start-run errors in the UI (not only the console). Paste a full JSON payload in the start-workflow document editor when the schema is an object.

## Playground (API key)

`bun run dev:web` — `answer-question`, `literature-review`, `write-article`, `shared-scope` (prompt-conflict warning), `nested-demo` (expand nested runs in the tree/waterfall; Non-Root toggle), new chat title after first turn, fork, edit a workflow (sidebar refresh / failed-reload banner), Cancel on a long run. After a failed nested step: Retry / Retry from here seeds a new attempt (prior run stays listed).

## Watch vs `--serve`

- Default dashboard prints `[adl] watching` and reloads registry edits (no browser required).
- `--serve` sets `ADL_PROJECT_WATCH=0` — no project reload. In this monorepo the UI is still Vite unless `--prebuilt`.
- Packed / published web is Nitro. Confirm project reload **without** `--serve`. `.env*` always needs a restart.
- **Warm navigations must stay cheap:** after the first `/workflows` (or `/api/project`), repeat loads should not re-import the project module graph or re-scan the full event store into the in-memory log. If page loads climb toward multi-second with growing `node_modules`/sqlite history, the process-host memo or one-shot event-log hydrate regressed.

## Docs

Follow [Project setup](../apps/docs/src/content/docs/guides/project-setup.md) on a new folder. File every step that does not work.

## Packed Node path

After a tarball install: `node node_modules/@agent-dev-lab/cli/dist/cli.js workflow run demo-counter --input '{"steps":3}'` and `dashboard --serve`. Process stays Node (no Bun relaunch).

## Publish

Remaining `.changeset/*.md` drive the next Version Packages PR (`.github/workflows/release.yml`); merging that PR publishes core, tools, cli, and web. Do not link `notes/` from product docs. npm OIDC trusted publishing must include all four packages for this repo/`release.yml`.
