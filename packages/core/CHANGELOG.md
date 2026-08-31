# @agent-dev-lab/core

## 0.0.1

### Patch Changes

- 2a9709b: Fold the tool loop into `agent.run()` / `agent.stream()`. `text` / `output` are the final response; tool call and result events still emit.
- 12a08ea: Expose the effective model (id + provider) on agents so the inspector Model section can show the configured LanguageModel when those fields are available.
- 87a2092: Support `ctx.setTitle` for workflow runs and an optional typed `titleWorkflow` on agents so conversations can be named after the first reply. Workflows can pin input/output with TypeScript generics when Zod is omitted.
- e80923b: Agent and workflow composition APIs: `createToolFromAgent`, `createToolFromWorkflow` (usable outside a workflow), and `createWorkflowFromAgent`. `ctx.emit(name, payload?)` for custom run events. Conversation messages use AI SDK `ModelMessage`. Per-run event order is `runSeq` (SQLite column `run_seq`), distinct from process-wide `logSeq`. OpenTelemetry settings are `AdlOpenTelemetrySettings`.
- e80923b: Core package layout for the first release: runtime implementation in `adl-runtime-impl.ts`, message stores under `stores/`, and prompt templates under `template/`.
- c71abcd: Add a process-wide in-memory event log (`EventLog` / `inMemoryEventLog`) that implements workflow and agent observers, with `list`, `clear`, and `waitForAppend`.
- 096979e: Shared SQLite helpers, logging, ESLint, and tsconfig ship as `@agent-dev-lab/core` exports (`./db`, `./logging`, `./eslint`, `./tsconfig/node.json`). There is no separate `@agent-dev-lab/common` package.
- 717e38a: Add project hot reload for dev: `LoadedAdlProject.reload()` and `watchAdlProject()` re-import agents, workflows, and templates while pinning stores. File-backed prompt templates re-read from disk on each render when `ADL_PROJECT_WATCH=1`. The inspection UI refreshes catalog metadata over SSE.
- 6706aa0: Expose message-store backend kind (`in-memory` / `sqlite` / custom) on agents so the inspector can show the configured memory mode.
- 30b00b8: Allow `agent.run` / `agent.stream` without a `memoryScope` (random id allocated) and emit warnings when another agent’s system prompt differs from the pin on a shared scope.
- 52853d6: Initial public **0.0.1** alpha: SQLite-backed stores, `adl init` / `adl run` / list / `adl dashboard`, durable inspection UI, and sample scaffold workflows.
- 0514d20: Show shared-scope conversation history up to the selected agent call, with later turns muted and separated.
- e4a3e03: Hold the inspection UI's loaded project on a process-wide host in `@agent-dev-lab/core/project` so Vite SSR isolates share one registry. File-watch reloads then show up on `GET /api/project` and SSE.
- 717e38a: Agents take `systemPrompt` (string or template). The inspection UI overlays the resolved prompt at the top of agent and workflow conversation views.
