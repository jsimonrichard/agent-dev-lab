# v1 / RC scope

Snapshot of **designed vs implemented vs remaining** for a first public release (0.1.0 RC). User-facing API docs: **`apps/docs`**. This file is the coding-agent checklist — update it when the inventory changes.

**Legend:** ✅ done · 🚧 partial / known gap · 🔲 not started · ⏸ deferred (not RC)

Last reconciled: **2026-08-29**.

---

## Runtime (`@agent-dev-lab/core`)

| Item                                                                        | Status                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `createAgent`, `createWorkflow`, `createTemplate`                           | ✅                                                    |
| `createAdlRuntime`, `adl.createAgent` / `createWorkflow` / `createTemplate` | ✅                                                    |
| `workflow.run(input)` + ALS context + `workflowRunId` on handle             | ✅                                                    |
| Nested `workflow.run` (shared run id) and `{ isolated: true }`              | ✅                                                    |
| `workflow.stream` live event tail                                           | ✅                                                    |
| `agent.run`, `agent.stream` (shared `streamText` core)                      | ✅                                                    |
| System prompt pinned on first episode; live inspect is `Result<string>`     | ✅                                                    |
| Structured output (`outputSchema` / per-call override)                      | ✅                                                    |
| `titleWorkflow` + isolated title runs + `agent_title_set`                   | ✅                                                    |
| `ctx.setTitle` / `workflow_title_set`                                       | ✅                                                    |
| Workflow generics when Zod is omitted                                       | ✅                                                    |
| `MessageStore` + `inMemoryMessageStore` / `sqliteMessageStore` (`kind`)     | ✅                                                    |
| `WorkflowStore` + in-memory / SQLite                                        | ✅                                                    |
| `sqliteInspectorSessionStore` (UI chat sessions)                            | ✅                                                    |
| `ctx.step` skip when stored output exists; `{ force: true }`                | ✅                                                    |
| Step keys, duplicate-name rules, nested steps                               | ✅                                                    |
| `WorkflowObserver` / `AgentObserver` fan-out via `RunRecorder`              | ✅                                                    |
| OTel spans at workflow / step / agent boundaries (`withActiveSpan`)         | ✅                                                    |
| `loadAdlProject` + indexes + duplicate id checks + `.env*` loading          | ✅                                                    |
| `LoadedAdlProject.reload()` + `watchAdlProject()` (dev; stores pinned)      | ✅                                                    |
| `createToolFromAgent` / `createToolFromWorkflow`                            | ✅                                                    |
| `AdlError` + `createTestRuntime`                                            | ✅                                                    |
| `eventSchemaVersion` on persisted events                                    | ✅                                                    |
| `EventLog` / `inMemoryEventLog` (process-wide observer, ring buffer)        | ✅                                                    |
| `inspectLanguageModel` / `Agent.modelInfo`                                  | ✅                                                    |
| AI SDK re-exports (`generateText`, `streamText`, `tool`, `stepCountIs`, …)  | ✅                                                    |
| Cancellation: `handle.cancel()` + `ctx.signal` + linked agent abort         | ✅                                                    |
| AI SDK `experimental_telemetry` on `streamText`                             | ✅ `createAdlRuntime({ telemetry })`; default enabled |
| `WorkflowResumer` / episode `cacheable`                                     | ⏸                                                     |

Docs: [apps/docs/src/content/docs/core/](../apps/docs/src/content/docs/core/)

---

## CLI (`adl`)

| Item                                                    | Status                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| `adl dashboard` / `adl dashboard --serve` / `--project` | ✅                                       |
| `adl run <workflow-id> --input '{}'`                    | ✅                                       |
| `adl workflows list` / `adl agents list`                | ✅                                       |
| `adl init` dedicated scaffold (`apps/cli/scaffold`)     | ✅ typecheck + demo-counter in CLI tests |
| Packaged `dist/scaffold` for published CLI              | ✅ copies `apps/cli/scaffold`            |

---

## Inspection UI (`apps/web`)

| Item                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| Project banner + dashboard (`/api/project`, recent runs/sessions)   | ✅     |
| Workflow list / start dialog (Zod input schema) / run history       | ✅     |
| Waterfall + step inspector + SSE `GET /api/runs/:id/events`         | ✅     |
| Start run server fn → `{ workflowRunId }` (non-blocking)            | ✅     |
| Cancel in-process run (UI + `handle.cancel`)                        | ✅     |
| Agent conversations, titles, fork from a workflow step              | ✅     |
| Shared-scope transcript slice (history up to selected call)         | ✅     |
| Agent config: model id/provider, memory kind, tools, title workflow | ✅     |
| Live inspect `systemPrompt` (`Result`) + overlay / inspect errors   | ✅     |
| Project hot reload SSE + failed-reload banner                       | ✅     |
| Live assistant text via `agent_text_delta` in chat / run views      | ✅     |
| Process-wide event log (`/events`, SSE, filters, pagination)        | ✅     |
| Event-log deep-links highlight the matching call / step             | ✅     |
| Template playground (edit/render markdown templates in UI)          | ⏸      |
| Dedicated token-debug pane (raw delta inspector)                    | ⏸      |
| `@agent-dev-lab/hooks` package                                      | ⏸      |

Design notes (architecture still accurate; checklists below were stale): [`inspection-ui.md`](./inspection-ui.md)

---

## Playground & docs

| Item                                                                        | Status                          |
| --------------------------------------------------------------------------- | ------------------------------- |
| Starlight guides + TypeDoc for core APIs                                    | ✅ includes inspection-UI guide |
| Playground: demo-counter, literature-review, write-article, answer-question | ✅                              |
| Agents, templates, tools, conversation titles, SQLite                       | ✅                              |
| Dedicated `adl init` scaffold (not playground)                              | ✅ `apps/cli/scaffold`          |

---

## RC blockers

These should be fixed (or explicitly waived) before tagging an RC.

### 1. `adl init` does not produce a typecheckable project — ✅

Dedicated scaffold lives in `apps/cli/scaffold` (small `adl.config`, `src/adl.ts` + model wiring, demo-counter, `ask` LLM workflow, `.env.example`). CLI tests assert local imports resolve, `tsc --noEmit` on the generated tree, `loadAdlProject` lists workflows, and `demo-counter` runs. Playground is no longer the init tree.

Still out of scope for the init file list: the [stress-test example](#stress-test-example) in `examples/` (not started).

### 2. Cancellation does not stop in-flight work — ✅

`WorkflowContext.signal` is the run AbortSignal. `ctx.step` rejects when it aborts; child `agent.run` / `agent.stream` AbortControllers are linked so `streamText` stops. Nested `workflow.run` links to the parent; `{ isolated: true }` does not. Unit tests cover mid-step and mid-`streamText` cancel.

### 3. No end-to-end proof of the published path — 🚧

CI now runs:

- `apps/web` tests (`"test": "bun test src"`)
- `adl init` → typecheck → `demo-counter` (CLI test)

Still not in CI:

- Drive the inspector in a browser
- Run a live (or recorded) multi-agent workflow

---

## Remaining feature work (RC)

| Priority | Item                                                      | Notes                                                 |
| -------- | --------------------------------------------------------- | ----------------------------------------------------- |
| ✅ P0    | Dedicated `adl init` scaffold + tests                     | `apps/cli/scaffold`; independent of playground        |
| ✅ P0    | Propagate cancel into steps + agents                      | `ctx.signal`; tests for mid-step and mid-`streamText` |
| ✅ P1    | Wire `apps/web` tests into `turbo run test`               | `"test": "bun test src"`                              |
| ✅ P1    | Re-export `stepCountIs` from `@agent-dev-lab/core`        |                                                       |
| ✅ P2    | Forward AI SDK `experimental_telemetry`                   | [`tracing.md`](./tracing.md)                          |
| ✅ P2    | Docs: inspection UI guide                                 | Starlight sidebar under `guides/`                     |
| ✅ P2    | Replace `apps/web/README.md` TanStack boilerplate         | Already project-specific; tests note updated          |
| P3       | Example OTel exporter in playground or docs               | Optional; core already starts spans                   |
| —        | Template playground, hooks package, live token debug pane | ⏸ not RC                                              |

---

## Remaining validation

### Unit / contract (in-repo, no API key)

**Core — add or thicken:**

| Area                                                       | Today                                                | Gap                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Workflow run / skip / keys / nest / isolate / titles / Zod | `execute.test.ts`                                    | Inspector session store still thin; duplicate id errors light |
| Agent prompt / titles / commit counts / stream / abort     | `agent-impl.test.ts`                                 | `outputSchema` mock coverage still light                      |
| `createToolFromAgent` / `createToolFromWorkflow`           | `from-agent.test.ts`                                 | ALS required; nested vs isolated (tools nest by default)      |
| SQLite + in-memory store contract                          | `store.contract.test.ts`                             | Inspector session store                                       |
| Project load / env / reload / watch                        | `load.test.ts`, `load-env.test.ts`, `reload.test.ts` | Duplicate id errors are light                                 |
| Templates                                                  | `create.test.ts`                                     | —                                                             |

**CLI:** init asserts generated files match `apps/cli/scaffold`, local imports resolve, `tsc --noEmit` passes (via monorepo `node_modules` symlink), and `demo-counter` runs through `loadAdlProject`.

**Web:** reducer/helper tests run in CI (`bun test src`). No component or browser tests.

### Integration (in-repo)

| Test                                                                         | Purpose                      |
| ---------------------------------------------------------------------------- | ---------------------------- |
| `adl init <tmpdir>` → typecheck → `demo-counter`                             | Scaffold is a real project   |
| `adl run demo-counter --input '{"steps":3}'` in that dir                     | CLI execution path           |
| `loadAdlProject` + `workflow.run` against playground with mock/no-LLM        | Registry + SQLite            |
| SSE helper already unit-tested; add a fetch against `vite` or Nitro if cheap | Event tail + terminal events |

Live playground (API key, 2026-08-27, not CI): `answer-question` completed (2 tool turns); `adl run literature-review` completed (search + parallel analyze + synthesize); workflow cancel during `literature-review` `agent_started` emitted `workflow_cancelled` and aborted `streamText`.

### End-to-end / stress (API key)

| Test                                                                                      | Purpose                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Browser: start `literature-review` (or example), waterfall updates, cancel                | Inspector + runtime                   |
| Browser: agent chat, title appears, fork from a step, Memory vs run transcript            | Conversation UI                       |
| CLI: `adl run` the [stress-test example](#stress-test-example) to completion              | Nested steps, tools, parallel, titles |
| Manual: `adl dashboard --serve` against a **non-workspace** install of published tarballs | Release dry-run                       |

Optional later: Playwright (or similar) in CI with a mock model so the inspector path is automated without OpenAI.

### Release dry-run

- `changeset` versions already target **0.1.0**
- `bun run build` then `changeset publish` (npm org `agent-dev-lab`)
- Install `@agent-dev-lab/cli` + `core` in a **directory outside this monorepo**, `adl init`, `adl run`, `adl dashboard --serve`

---

## Stress-test example

**Why not playground:** Init used to copy playground sources, so a large “real” workflow in playground either bloated every new project or we kept playing whack-a-mole with the init file list. Playground stays the **framework-dev** target (`bun run dev:web`); `adl init` uses `apps/cli/scaffold`.

**Where:** `examples/<name>/` at the repo root (own `adl.config.ts`, not a workspace app the CLI packages). Do **not** add it to init file lists. Alternatively a private sibling repo that depends on published (or `file:`) packages — even closer to the user path.

**What it should exercise** (playground already has pieces; the example should combine them in one long run):

| Capability                                 | Playground hint          | Example should…                                          |
| ------------------------------------------ | ------------------------ | -------------------------------------------------------- |
| Nested workflows + `ctx.step` around `run` | literature-review        | Several registered **and** unregistered helpers          |
| `{ isolated: true }`                       | title workflow           | Helpers that must not pollute the parent waterfall       |
| Parallel keyed steps                       | `Promise.all` in analyze | Fan-out over N topics/sources                            |
| TS-driven tool loop                        | answer-question          | Multi-turn tools with a cap                              |
| Structured output                          | outliner / editor        | At least one Zod `outputSchema` agent                    |
| File templates                             | `outliner.md`            | Colocated markdown prompts                               |
| Conversation titles                        | `titleWorkflow`          | First-turn titles on agent chats                         |
| Custom events + `ctx.setTitle`             | write-article            | Inspector-visible progress                               |
| Real tools                                 | OpenAI `web_search`      | Search + at least one project-local tool                 |
| Step retry                                 | core tests only          | One deliberate fail-then-rerun with same `workflowRunId` |
| Duration                                   | short demos              | Minutes-long enough to watch SSE, cancel, reconnect      |

**Suggested shape (not implemented yet):** a “literature sprint” — ingest a topic, search, cluster papers, write a structured outline, critique in parallel, synthesize a brief, optional revision. Orchestration stays plain TypeScript.

**Success:** a new clone of this repo can `cd examples/<name> && bun install && adl run …` (workspace protocol) **and**, after publish, the same tree works with npm versions. Inspector can open that project via `adl dashboard --project`.

---

## Gaps already decided (not RC)

| Topic                     | Status                             | Notes                                                      |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Model / provider setup    | ✅                                 | `createAdlRuntime({ defaults: { model } })` + env docs     |
| Workflow input validation | ✅                                 | Zod on `createWorkflow`; parsed at `run()`                 |
| Shared `tools` in config  | ✅                                 | Runtime `tools` merge; `adl.config.tools` is registry-only |
| Error types               | ✅                                 | `AdlError` + CLI messages (`DEBUG=adl` for stacks)         |
| Testing helpers           | ✅                                 | `createTestRuntime()`                                      |
| OTEL default observer     | ✅ spans + AI SDK telemetry option | App installs exporter                                      |
| Event schema versioning   | ✅                                 | `eventSchemaVersion: 1`                                    |
| Secrets / API keys        | ✅                                 | Document env vars only                                     |
| Human approval            | ⏸                                  | [`future-extensions.md`](./future-extensions.md)           |
| Memory pipeline           | ⏸                                  | [`memory-pipeline.md`](./memory-pipeline.md)               |
| Checkpoints               | ⏸                                  | [`resumability.md`](./resumability.md)                     |
| Workflow catalog grouping | ⏸                                  | [`workflow-catalog.md`](./workflow-catalog.md)             |

---

## Likely not v1

- Dynamic config registration
- Workflow / agent catalog folders, tags, or namespaced ids ([`workflow-catalog.md`](./workflow-catalog.md))
- `RunHandle` (beyond current `WorkflowRunHandle` / `AgentRunHandle`)
- Auto workflow resume mid-closure
- Mid-stream token resume
- AI SDK WorkflowAgent / durable execution required path
- Evals / scorers in runtime
- Multi-tenant auth on run APIs
