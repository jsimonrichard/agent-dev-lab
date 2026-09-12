# @agent-dev-lab/web

## 0.0.4

### Patch Changes

- b0e3dc3: The inspection UI process prints a Vite-shaped `[adl] reload <file>` line when the project registry reloads, and `[adl] reload failed` when it does not.
- 801309c: Conversation metadata and agent episodes are now first-class store types. **Breaking:** `adl_inspector_sessions` → `adl_conversation_metadata`, `adl_workflow_events` → `adl_run_events` (existing DBs renamed on open). Adds `adl_agent_episodes`, `conversation_forked`, and `listEvents({ memoryScope })`.
- 76c6bde: Add run tags: `workflow.run(input, { tags })` and `agent.run({ tags })` record them, `WorkflowStore.listRuns({ tags })` filters by any-of match, and `setRunTags` replaces a workflow run's tags. The inspection UI shows them in inspector footers.
- 54da4c6: Arm project watch on the address Vite actually bound. A second `dev:web` no longer dies with ConnectionRefused against hardcoded `127.0.0.1`.
- 801309c: `watchAdlProject` now uses chokidar and returns `{ ready, close }` instead of a dispose function (**breaking**). The inspection UI watches in the same process as `/api`; the Vite reload plugin and `/api/project/reload` are gone.
- bcd5dac: The inspection UI arms project file watching when the server starts, so registry reloads no longer wait for a browser to open a page.
- 851f524: `adl dashboard` now watches the project registry. `--serve` disables watching (`ADL_PROJECT_WATCH=0`); `--prebuilt` forces the Nitro UI in the monorepo.
- 801309c: Fix chat history for multi-round tool calls: keep the highest commit total per episode so earlier rounds stay visible when commits arrive out of order.
- 801309c: Fix the agent settings panel: `stopWhen` is labeled default vs custom from `agent.definition.stopWhen`, and a `ToolProvider`'s tools come from `listTools()` (empty if missing).
- Updated dependencies [801309c]
- Updated dependencies [bcf5603]
- Updated dependencies [76c6bde]
- Updated dependencies [801309c]
- Updated dependencies [e01a47f]
- Updated dependencies [84247b6]
- Updated dependencies [bcf5603]
- Updated dependencies [801309c]
- Updated dependencies [851f524]
- Updated dependencies [bcf5603]
- Updated dependencies [8d85d21]
  - @agent-dev-lab/core@0.0.4

## 0.0.3

### Patch Changes

- 577a830: Fix `bun.lock`'s cached `workspaces[path].version` fields going stale after `changeset version` bumps a workspace package's version. `bun install` alone does not refresh that field for an unrelated dependency-graph change (a version bump with no dependency changes), so `bun pm pack` kept resolving internal `workspace:*` references to the old (or, once genuinely stale enough, a bogus `0.0.0`) version at publish time — this is what broke the `0.0.2` publish of `@agent-dev-lab/cli` and `@agent-dev-lab/web`, whose `@agent-dev-lab/core` dependency resolved to a nonexistent `0.0.0`.

  `scripts/patch-lock.ts` now runs as part of the `version` script and rewrites `bun.lock`'s workspace version fields directly from each workspace's `package.json`, independent of `bun install`'s incremental update behavior.

- Updated dependencies [577a830]
  - @agent-dev-lab/core@0.0.3

## 0.0.2

### Patch Changes

- 731bdb5: Fix `workspace:*` dependency ranges being published unresolved (e.g. `"@agent-dev-lab/core": "workspace:*"` in the published `@agent-dev-lab/cli` and `@agent-dev-lab/web` manifests), which broke installing these packages outside the monorepo. `changeset publish` only rewrites explicit workspace ranges (e.g. `workspace:^1.2.0`), not bare aliases like `workspace:*`, and plain `npm publish` has no concept of the `workspace:` protocol at all.

  Publishing now packs each package with `bun pm pack`, which resolves workspace protocol ranges to the real published version before handing the tarball to `npm publish`.

- Updated dependencies [731bdb5]
  - @agent-dev-lab/core@0.0.2

## 0.0.1

### Patch Changes

- 491f8a6: Fold the tool loop into `agent.run()` / `agent.stream()`. `text` / `output` are the final response; tool call and result events still emit.
- 491f8a6: Expose the effective model (id + provider) on agents so the inspector Model section can show the configured LanguageModel when those fields are available.
- 491f8a6: Support `ctx.setTitle` for workflow runs and an optional typed `titleWorkflow` on agents so conversations can be named after the first reply. Workflows can pin input/output with TypeScript generics when Zod is omitted.
- 491f8a6: Agent and workflow composition APIs: `createToolFromAgent`, `createToolFromWorkflow` (usable outside a workflow), and `createWorkflowFromAgent`. `ctx.emit(name, payload?)` for custom run events. Conversation messages use AI SDK `ModelMessage`. Per-run event order is `runSeq` (SQLite column `run_seq`), distinct from process-wide `logSeq`. OpenTelemetry settings are `AdlOpenTelemetrySettings`.
- 491f8a6: Deep-link Event log rows into run and chat views, highlighting the matching agent-call transcript slice (`?call=`).
- 491f8a6: Add an Event log inspection page that tails the process-wide log over SSE, with field filters, pagination, and hydrate-from-store on startup.
- 491f8a6: Shared SQLite helpers, logging, ESLint, and tsconfig ship as `@agent-dev-lab/core` exports (`./db`, `./logging`, `./eslint`, `./tsconfig/node.json`). There is no separate `@agent-dev-lab/common` package.
- 491f8a6: Add project hot reload for dev: `LoadedAdlProject.reload()` and `watchAdlProject()` re-import agents, workflows, and templates while pinning stores. File-backed prompt templates re-read from disk on each render when `ADL_PROJECT_WATCH=1`. The inspection UI refreshes catalog metadata over SSE.
- 491f8a6: Expose message-store backend kind (`in-memory` / `sqlite` / custom) on agents so the inspector can show the configured memory mode.
- 491f8a6: Initial public **0.0.1** alpha: SQLite-backed stores, `adl init` / `adl run` / list / `adl dashboard`, durable inspection UI, and sample scaffold workflows.
- 491f8a6: Show shared-scope conversation history up to the selected agent call, with later turns muted and separated.
- 491f8a6: Hold the inspection UI's loaded project on a process-wide host in `@agent-dev-lab/core/project` so Vite SSR isolates share one registry. File-watch reloads then show up on `GET /api/project` and SSE.
- 491f8a6: Agents take `systemPrompt` (string or template). The inspection UI overlays the resolved prompt at the top of agent and workflow conversation views.
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
- Updated dependencies [491f8a6]
  - @agent-dev-lab/core@0.0.1
