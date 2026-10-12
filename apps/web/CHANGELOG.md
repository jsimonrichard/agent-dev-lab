# @agent-dev-lab/web

## 0.0.6

### Patch Changes

- 7c832ef: The dashboard fills the in-memory event log from the store once per process, not on every request.
- d065606: Expanding or selecting another nest no longer cancels in-flight fetches for a nested run.
- daacb4a: Selecting a nested run shows a loading skeleton instead of flashing "No input recorded".
- c2f8ffa: A nested run shows a spinner on its expand chevron while children load, instead of a placeholder row.
- 2b713d9: Nested `workflow.run()` gets its own `workflowRunId` and `parentWorkflowRunId`. The run list defaults to roots, with a Non-Root toggle. Custom `WorkflowStore`s must add `listDescendantRuns`. Cancel on a nested id aborts the active root.
- 0f7ae59: Nested runs show in the tree and waterfall under the calling step, or under the workflow row when called at the root. `parentStepId` is set when the call is inside `ctx.step`.
- 1a6945f: Bump `radix-ui` to ^1.6.7 so FocusScope/DismissableLayer compose refs stay stable under React 19 (stops the setRef Maximum update depth variant on ScrollArea / menus / context menus).
- 8512b15: Retry and Retry from here seed a new attempt; the prior run stays listed. Retry is hidden while that forest is still running. Copied steps link to the original. The waterfall keeps prior durations as a dimmer bar in that row's color (workflow, step, or agent). A line marks the retry point; time past it has a dashed border, and a parent bar that already covered that point starts from the prior attempt.
- 37ef304: Stop the workflow run page from calling `router.invalidate()` on loader-seeded lifecycle events (that rebuilt `initialEvents`, reset the live event list, and looped until max update depth).
- cb7c10c: Stop residual max-update-depth loops on the workflow run page: URL→selection sync no longer depends on live `view.steps` identity (SSE rebuilt that array every event); nested message prefetch no longer lists its Map in effect deps; drop the waterfall `clientWidth`→pixel-width ResizeObserver feedback loop; stabilize JSON validity reporters; hydrate live duration labels with a stable clock (`0` until mount) so SSR matches the client. Adds a `tick-burst` Playwright regression.
- a00bb80: The step conversation inspector no longer flashes "No conversation recorded." between streamed text and the stored transcript.
- d76bb17: Sidebars and inspect panels show provider-reported input and output tokens. "This call" appears only for the episode opened with `?call=`.
- 8512b15: The start-workflow form edits the whole input as a document or as raw JSON. Parse errors show on submit, not while typing.
- Updated dependencies [12a811c]
- Updated dependencies [d76bb17]
- Updated dependencies [7c832ef]
- Updated dependencies [183807f]
- Updated dependencies [2b713d9]
- Updated dependencies [0f7ae59]
  - @agent-dev-lab/core@0.0.6

## 0.0.5

### Patch Changes

- ae70fad: Add inspector-only per-agent default `toolProviderContext` (`adl_inspector_agent_settings`) and a definition-page editor. `agent.run` never reads it.
- cd194cb: Surface mid-turn `agent_failed` errors in the standalone chat UI (SSE + call-events fetch) instead of only the server console.
- 900241e: Fix standalone chat turn races: roll back optimistic messages on failed send, reseed tool context only on runId change, and clear held stream text when starting the next turn.
- de3536e: Clear the standalone chat `agent_failed` banner when a later turn succeeds, instead of keeping the prior call's error after `latestAgentCallId` moves on.
- 27b2714: Restore scrolling on agent and workflow definition pages so Agent Settings is not clipped by the overflow-hidden app shell.
- 0a9f0c2: Keep the tool-context dialog's document/JSON switcher outside the scroll region so it stays visible while editing long forms.
- ee5cb5f: Omitted array fields use "Create list" to initialize `[]`. "Add item" remains for an existing list.
- c3f4faa: Inspect a historical episode's `toolProviderContext` via `?call=`, chat/event-log context menus, and the workflow step inspector; copy into the next-turn draft on editable chats.
- 9bd9ac8: JSON raw fields use CodeMirror with the existing token colors so keys, strings, and punctuation are highlighted while editing.
- caebce9: Inspection UI JSON fields use a structured document editor (add/remove array items and object keys) with a raw JSON escape hatch that fails closed on invalid paste.
- 4fbf026: Optional boolean fields in inspector schema forms are omitted when unset instead of being serialized as `false`.
- 1ffacfa: Required fields with a schema default use Reset (restore the default) instead of Clear (omit).
- 05ef9a7: Tool-provider context schemas no longer wrap defaulted fields in `.partial()`. The inspection UI treats Zod `.default()` as a present value (not optional) and shows it in the schema display.
- fa9faa7: Show Zod `.describe()` help under schema field labels (including nested object fields).
- 474994a: Conversation tool-context form is an inspector-only draft seeded from the latest episode, fork source, or agent default.
- a6bb3b8: Stand-alone dashboard chats can supply `toolProviderContext` from a ToolProvider's `contextSchema` (or a JSON field) instead of only workflow-driven `agent.run` calls.
- 6ec8db1: Hold streamed assistant text until the transcript refresh lands after `agent_messages_committed`, and stop wiping the chat when only the tool-context draft seed changes — so the final reply after a tool loop stays visible without a reload.
- eacb604: Show an animated three-dot typing indicator while an agent turn is in flight, including before the first streamed token.
- Updated dependencies [fcaf9ac]
- Updated dependencies [118059f]
- Updated dependencies [ae70fad]
  - @agent-dev-lab/core@0.0.5

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
