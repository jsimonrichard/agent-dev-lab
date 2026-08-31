# Human validation (0.0.1 alpha)

Internal checklist before publishing. Not linked from the docs site.

## Naming conventions (how to read the repo)

| Pattern                                             | Meaning                                                   |
| --------------------------------------------------- | --------------------------------------------------------- |
| `*.test.ts` next to source                          | Unit / in-process                                         |
| `*.integration.test.ts`                             | Multi-module, still in-process (mock model, temp project) |
| `src/e2e/` or `*.e2e.test.ts` that spawns a process | CLI / Vite spawn                                          |
| `create*` / `*Impl` / `inspect*` / `resolve*`       | Factories, implementations, metadata helpers, resolvers   |
| `apps/web/src/lib/view-model/`                      | Production UI state types (not test mocks)                |
| `notes/`                                            | Coding-agent / RC tracking only                           |
| `@agent-dev-lab/core/project` process host          | Inspector-only project/reload wiring                      |

Large files to read as one unit: `apps/web/src/components/app/workflow-tree-panel.tsx`, shadcn `sidebar.tsx`.

## Prereqs

- Bun **1.3.13** (see root `packageManager`) for monorepo install/dev
- Node **22+** for the published Node path (`better-sqlite3`)
- `OPENAI_API_KEY` for live LLM checks (playground)
- This checkout

## A. Automated (must be green)

From the repo root:

```bash
bun install
bun run lint
bun run format:check
bun run typecheck
bun run test          # includes CLI `src/e2e` (init-smoke + init-pack) via apps/cli test script
bun run build
```

Confirm:

- Store contract tests pass under Bun (`bun:sqlite`) and that Node can open SQLite (`better-sqlite3`) — packed e2e / section G.
- CLI e2e is part of `bun test src` in `apps/cli` (not only `test:e2e`).

## B. Fresh-user path (this checkout)

```bash
bun apps/cli/src/bin/cli.ts init /tmp/adl-validate --local
cd /tmp/adl-validate
bun install
cp .env.example .env   # optional key for ask
adl workflow list
adl agent list
adl workflow run demo-counter --input '{"steps":3}'   # expect sum 6
adl agent run assistant --input "ping"       # needs a key for a real model reply
adl dashboard                                # or bun run dev
```

Confirm `#adl` in `package.json` imports + `tsconfig` paths, `.env.example`, SQLite under `.data/`.

## C. Browser (scaffold, no key for counter)

With the dashboard from B:

1. Start **demo-counter** from the UI (`steps: 3`) → waterfall + step outputs → reopen the finished run.
2. Event log → click a row → lands on the run (deep-link).
3. For cancel: start a long playground run (section D) → **Cancel** → `workflow_cancelled` and the model stops.

Also confirm start-run / chat failures show in the UI (not only the server console). System-prompt conflicts should surface as amber **warnings** (`agent_warning`) when two agents share a scope.

## D. Browser (playground + key)

```bash
cd <checkout>
cp apps/playground/.env.example apps/playground/.env   # OPENAI_API_KEY, optional ADL_MODEL
bun run dev:web
```

Exercise:

- `answer-question` (tool loop)
- `literature-review` (parallel)
- `write-article` (titles / custom events)
- `shared-scope` (one transcript, two agents; expect prompt-conflict warning)
- New agent chat → title appears after first turn
- Fork from a workflow episode
- Edit a registered workflow file → sidebar refresh; break syntax → failed-reload banner

## E. Serve mode (published default)

```bash
adl dashboard --serve --project /tmp/adl-validate
```

And in **G**, a tarball install **without** `--serve` (should still be Nitro). Confirm **no hot reload**; start a run anyway.

## F. Docs walkthrough

Follow [Project setup](../apps/docs/src/content/docs/guides/project-setup.md) literally on a new folder after docs fixes. File every step that does not work (layout under `src/`, `#adl` imports, env, pitfalls).

## G. Release dry-run (packed + Node)

Automated: `apps/cli/src/e2e/init-pack.e2e.test.ts` (pack four packages → `adl init` without `--local` → install tarballs → typecheck + `demo-counter` + dashboard `--serve`).

Manual extras:

1. After tarball install, run with **Node** (not Bun):

   ```bash
   node node_modules/@agent-dev-lab/cli/dist/cli.js workflow run demo-counter --input '{"steps":3}'
   node node_modules/@agent-dev-lab/cli/dist/cli.js dashboard --serve --port 3010
   ```

2. Confirm **no Bun relaunch** (process stays Node).
3. Native compile of `better-sqlite3` may require build tools — document any host-specific install gotcha you hit.

## H. Explicit non-goals (this release)

- Template playground UI
- Dedicated token-debug pane
- `examples/` stress project
- Memory pipeline / checkpoints
- Playwright suite
- Second npm package named only `adl`
- Running `changeset version` / publish in this pass (expect **0.0.1** when humans version)

## I. Publish notes for humans

- In-repo versions are **0.0.0**; remaining `.changeset/*.md` are **patch** only → `bun run version-packages` yields **0.0.1**. Merging to `main` opens a Version Packages PR via `.github/workflows/release.yml`; merging that PR publishes core, cli, and web.
- Pinning `@tanstack/*: latest` in `apps/web` is still a human judgment call.
- `notes/` stays internal; do not link it from product docs.
