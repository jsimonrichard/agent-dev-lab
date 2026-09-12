# @agent-dev-lab/core

## 0.0.4

### Patch Changes

- 801309c: Conversation metadata and agent episodes are now first-class store types. **Breaking:** `adl_inspector_sessions` → `adl_conversation_metadata`, `adl_workflow_events` → `adl_run_events` (existing DBs renamed on open). Adds `adl_agent_episodes`, `conversation_forked`, and `listEvents({ memoryScope })`.
- bcf5603: `LoadedAdlProject.getAgent()` is typed as `AnyAgent`, matching `AdlProjectConfig.agents`.
- 76c6bde: Add run tags: `workflow.run(input, { tags })` and `agent.run({ tags })` record them, `WorkflowStore.listRuns({ tags })` filters by any-of match, and `setRunTags` replaces a workflow run's tags. The inspection UI shows them in inspector footers.
- 801309c: `workflow.run()` and `agent.run()` now tag provenance as `version:<value>` from `AdlRuntimeConfig.version`, or `commit:<id>` from jj/git (`+dirty` when the tree is dirty). A matching call-site tag wins; `version: false` skips tagging (`createTestRuntime` defaults to that).
- e01a47f: Streaming tools now emit `preliminary: true` on intermediate `AgentToolResultEvent`s. `createAsyncChannel` is a public export for bridging push sources into an `AsyncIterable`.
- 84247b6: Add optional `ToolProvider.dispose?()` (project reload/unload) and `onRunEnd?()` (per agent episode), plus `agentCallId` and `projectRoot` on the tool-provider envelope. `LoadedAdlProject` attaches `project.root` and disposes outgoing registry providers after a successful reload.
- bcf5603: Add `ToolProvider` (`{ getTools(ctx) }`) so tools can depend on runtime context. `AgentDefinition.tools` and `AgentRunInput.tools` accept a `ToolSet` or provider; `createToolProvider` wraps a function and `combineToolProviders` merges named sources with namespaced context. Optional `listTools()` and `contextSchema` are introspection-only.
- 801309c: `watchAdlProject` now uses chokidar and returns `{ ready, close }` instead of a dispose function (**breaking**). The inspection UI watches in the same process as `/api`; the Vite reload plugin and `/api/project/reload` are gone.
- 851f524: `adl dashboard` now watches the project registry. `--serve` disables watching (`ADL_PROJECT_WATCH=0`); `--prebuilt` forces the Nitro UI in the monorepo.
- bcf5603: Rename workflow `input`/`output` to `inputSchema`/`outputSchema` (**breaking**). Update `adl.createWorkflow({ input, output })` to `{ inputSchema, outputSchema }`.
- 8d85d21: Bump `zod` to `^4.1.8`. Projects still on Zod 3 for their own schemas need to upgrade alongside this release.

## 0.0.3

### Patch Changes

- 577a830: Fix `bun.lock`'s cached `workspaces[path].version` fields going stale after `changeset version` bumps a workspace package's version. `bun install` alone does not refresh that field for an unrelated dependency-graph change (a version bump with no dependency changes), so `bun pm pack` kept resolving internal `workspace:*` references to the old (or, once genuinely stale enough, a bogus `0.0.0`) version at publish time — this is what broke the `0.0.2` publish of `@agent-dev-lab/cli` and `@agent-dev-lab/web`, whose `@agent-dev-lab/core` dependency resolved to a nonexistent `0.0.0`.

  `scripts/patch-lock.ts` now runs as part of the `version` script and rewrites `bun.lock`'s workspace version fields directly from each workspace's `package.json`, independent of `bun install`'s incremental update behavior.

## 0.0.2

### Patch Changes

- 731bdb5: Fix `workspace:*` dependency ranges being published unresolved (e.g. `"@agent-dev-lab/core": "workspace:*"` in the published `@agent-dev-lab/cli` and `@agent-dev-lab/web` manifests), which broke installing these packages outside the monorepo. `changeset publish` only rewrites explicit workspace ranges (e.g. `workspace:^1.2.0`), not bare aliases like `workspace:*`, and plain `npm publish` has no concept of the `workspace:` protocol at all.

  Publishing now packs each package with `bun pm pack`, which resolves workspace protocol ranges to the real published version before handing the tarball to `npm publish`.

## 0.0.1

### Patch Changes

- 491f8a6: Fold the tool loop into `agent.run()` / `agent.stream()`. `text` / `output` are the final response; tool call and result events still emit.
- 491f8a6: Expose the effective model (id + provider) on agents so the inspector Model section can show the configured LanguageModel when those fields are available.
- 491f8a6: Support `ctx.setTitle` for workflow runs and an optional typed `titleWorkflow` on agents so conversations can be named after the first reply. Workflows can pin input/output with TypeScript generics when Zod is omitted.
- 491f8a6: Agent and workflow composition APIs: `createToolFromAgent`, `createToolFromWorkflow` (usable outside a workflow), and `createWorkflowFromAgent`. `ctx.emit(name, payload?)` for custom run events. Conversation messages use AI SDK `ModelMessage`. Per-run event order is `runSeq` (SQLite column `run_seq`), distinct from process-wide `logSeq`. OpenTelemetry settings are `AdlOpenTelemetrySettings`.
- 491f8a6: Core package layout for the first release: runtime implementation in `adl-runtime-impl.ts`, message stores under `stores/`, and prompt templates under `template/`.
- 491f8a6: Add a process-wide in-memory event log (`EventLog` / `inMemoryEventLog`) that implements workflow and agent observers, with `list`, `clear`, and `waitForAppend`.
- 491f8a6: Shared SQLite helpers, logging, ESLint, and tsconfig ship as `@agent-dev-lab/core` exports (`./db`, `./logging`, `./eslint`, `./tsconfig/node.json`). There is no separate `@agent-dev-lab/common` package.
- 491f8a6: Add project hot reload for dev: `LoadedAdlProject.reload()` and `watchAdlProject()` re-import agents, workflows, and templates while pinning stores. File-backed prompt templates re-read from disk on each render when `ADL_PROJECT_WATCH=1`. The inspection UI refreshes catalog metadata over SSE.
- 491f8a6: Expose message-store backend kind (`in-memory` / `sqlite` / custom) on agents so the inspector can show the configured memory mode.
- 491f8a6: Allow `agent.run` / `agent.stream` without a `memoryScope` (random id allocated) and emit warnings when another agent’s system prompt differs from the pin on a shared scope.
- 491f8a6: Initial public **0.0.1** alpha: SQLite-backed stores, `adl init` / `adl run` / list / `adl dashboard`, durable inspection UI, and sample scaffold workflows.
- 491f8a6: Show shared-scope conversation history up to the selected agent call, with later turns muted and separated.
- 491f8a6: Hold the inspection UI's loaded project on a process-wide host in `@agent-dev-lab/core/project` so Vite SSR isolates share one registry. File-watch reloads then show up on `GET /api/project` and SSE.
- 491f8a6: Agents take `systemPrompt` (string or template). The inspection UI overlays the resolved prompt at the top of agent and workflow conversation views.
