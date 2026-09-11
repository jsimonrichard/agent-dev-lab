# Human validation

Reusable checklist before a publish. Not linked from the docs site.

Published packages (2026-09-11): **core/web 0.0.3**, **cli 0.0.5**. Next release adds `@agent-dev-lab/tools`.

## Automated

From the repo root: `bun install`, then `lint`, `format:check`, `typecheck`, `test`, `build`. CLI e2e (`init-smoke` + `init-pack`) is part of `apps/cli`'s `bun test src`. Packed e2e covers Node + `better-sqlite3`.

## Fresh project

```bash
bun apps/cli/src/bin/cli.ts init /tmp/adl-validate --local
cd /tmp/adl-validate
bun install
cp .env.example .env
adl workflow run demo-counter --input '{"steps":3}'   # sum 6
adl dashboard
```

Confirm `#adl` imports, `.env.example`, SQLite under `.data/`. In the UI: start demo-counter, reopen the run, event-log deep-link, start-run errors in the UI (not only the console).

## Playground (API key)

`bun run dev:web` — `answer-question`, `literature-review`, `write-article`, `shared-scope` (prompt-conflict warning), new chat title after first turn, fork, edit a workflow (sidebar refresh / failed-reload banner), Cancel on a long run.

## Watch vs `--serve`

- Default dashboard prints `[adl] watching` and reloads registry edits (no browser required).
- `--serve` sets `ADL_PROJECT_WATCH=0` — no project reload. In this monorepo the UI is still Vite unless `--prebuilt`.
- Packed / published web is Nitro. Confirm project reload **without** `--serve`. `.env*` always needs a restart.

## Docs

Follow [Project setup](../apps/docs/src/content/docs/guides/project-setup.md) on a new folder. File every step that does not work.

## Packed Node path

After a tarball install: `node node_modules/@agent-dev-lab/cli/dist/cli.js workflow run demo-counter --input '{"steps":3}'` and `dashboard --serve`. Process stays Node (no Bun relaunch).

## Publish

Remaining `.changeset/*.md` are patch. Merging to `main` opens a Version Packages PR (`.github/workflows/release.yml`); merging that PR publishes core, tools, cli, and web. Do not link `notes/` from product docs. First publish of `@agent-dev-lab/tools` needs that package added as an npm OIDC trusted publisher for this repo/`release.yml`.
