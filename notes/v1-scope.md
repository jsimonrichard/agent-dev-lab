# v1 / RC scope

Snapshot of **designed vs implemented vs remaining** for a first public release (0.1.0 RC). User-facing API docs: **`apps/docs`**. This file is the coding-agent checklist — update it when the inventory changes.

**Legend:** ✅ done · 🚧 partial / known gap · 🔲 not started · ⏸ deferred (not RC)

Last reconciled: **2026-08-27**.

---

## Runtime (`@agent-dev-lab/core`)

| Item                                                                        | Status                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `createAgent`, `createWorkflow`, `createTemplate`                           | ✅                                                              |
| `createAdlRuntime`, `adl.createAgent` / `createWorkflow` / `createTemplate` | ✅                                                              |
| `workflow.run(input)` + ALS context + `workflowRunId` on handle             | ✅                                                              |
| Nested `workflow.run` (shared run id) and `{ isolated: true }`              | ✅                                                              |
| `workflow.stream` live event tail                                           | ✅                                                              |
| `agent.run`, `agent.stream` (shared `streamText` core)                      | ✅                                                              |
| System prompt pinned on first episode; live inspect is `Result<string>`     | ✅                                                              |
| Structured output (`outputSchema` / per-call override)                      | ✅                                                              |
| `titleWorkflow` + isolated title runs + `agent_title_set`                   | ✅                                                              |
| `ctx.setTitle` / `workflow_title_set`                                       | ✅                                                              |
| Workflow generics when Zod is omitted                                       | ✅                                                              |
| `MessageStore` + `inMemoryMessageStore` / `sqliteMessageStore` (`kind`)     | ✅                                                              |
| `WorkflowStore` + in-memory / SQLite                                        | ✅                                                              |
| `sqliteInspectorSessionStore` (UI chat sessions)                            | ✅                                                              |
| `ctx.step` skip when stored output exists; `{ force: true }`                | ✅                                                              |
| Step keys, duplicate-name rules, nested steps                               | ✅                                                              |
| `WorkflowObserver` / `AgentObserver` fan-out via `RunRecorder`              | ✅                                                              |
| OTel spans at workflow / step / agent boundaries (`withActiveSpan`)         | ✅                                                              |
| `loadAdlProject` + indexes + duplicate id checks + `.env*` loading          | ✅                                                              |
| `LoadedAdlProject.reload()` + `watchAdlProject()` (dev; stores pinned)      | ✅                                                              |
| `createToolFromAgent` / `createToolFromWorkflow`                            | ✅                                                              |
| `AdlError` + `createTestRuntime`                                            | ✅                                                              |
| `eventSchemaVersion` on persisted events                                    | ✅                                                              |
| `inspectLanguageModel` / `Agent.modelInfo`                                  | ✅                                                              |
| AI SDK re-exports (`generateText`, `streamText`, `tool`, `CoreMessage`, …)  | 🚧 `stepCountIs` used internally, not re-exported               |
| Cancellation: `handle.cancel()` + `workflow_cancelled`                      | 🚧 Abort is **not** passed into `ctx.step` or child `agent.run` |
| AI SDK `experimental_telemetry` on `streamText`                             | 🔲                                                              |
| `WorkflowResumer` / episode `cacheable`                                     | ⏸                                                               |

Docs: [apps/docs/src/content/docs/core/](../apps/docs/src/content/docs/core/)

---

## CLI (`adl`)

| Item                                                    | Status                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `adl dashboard` / `adl dashboard --serve` / `--project` | ✅                                                                  |
| `adl run <workflow-id> --input '{}'`                    | ✅                                                                  |
| `adl workflows list` / `adl agents list`                | ✅                                                                  |
| `adl init` copies a file list from playground           | 🚧 **Broken as a usable project** — see [RC blockers](#rc-blockers) |
| Packaged `dist/scaffold` for published CLI              | ✅ (same file-list bug)                                             |

---

## Inspection UI (`apps/web`)

| Item                                                                | Status                            |
| ------------------------------------------------------------------- | --------------------------------- |
| Project banner + dashboard (`/api/project`, recent runs/sessions)   | ✅                                |
| Workflow list / start dialog (Zod input schema) / run history       | ✅                                |
| Waterfall + step inspector + SSE `GET /api/runs/:id/events`         | ✅                                |
| Start run server fn → `{ workflowRunId }` (non-blocking)            | ✅                                |
| Cancel in-process run (UI + `handle.cancel`)                        | ✅ (limited by runtime abort gap) |
| Agent conversations, titles, fork from a workflow step              | ✅                                |
| Shared-scope transcript slice (history up to selected call)         | ✅                                |
| Agent config: model id/provider, memory kind, tools, title workflow | ✅                                |
| Live inspect `systemPrompt` (`Result`) + overlay / inspect errors   | ✅                                |
| Project hot reload SSE + failed-reload banner                       | ✅                                |
| Live assistant text via `agent_text_delta` in chat / run views      | ✅                                |
| Template playground (edit/render markdown templates in UI)          | ⏸                                 |
| Dedicated token-debug pane (raw delta inspector)                    | ⏸                                 |
| `@agent-dev-lab/hooks` package                                      | ⏸                                 |

Design notes (architecture still accurate; checklists below were stale): [`inspection-ui.md`](./inspection-ui.md)

---

## Playground & docs

| Item                                                                        | Status                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Starlight guides + TypeDoc for core APIs                                    | ✅ conceptual; 🚧 no inspection-UI guide until this RC docs pass |
| Playground: demo-counter, literature-review, write-article, answer-question | ✅                                                               |
| Agents, templates, tools, conversation titles, SQLite                       | ✅                                                               |
| Playground as `adl init` source of truth                                    | 🚧 Init file list ≠ playground `adl.config.ts` imports           |

---

## RC blockers

These should be fixed (or explicitly waived) before tagging an RC.

### 1. `adl init` does not produce a typecheckable project

`PLAYGROUND_SOURCE_FILES` copies:

- `src/adl.ts`, `src/agents/researcher.ts`, `src/agents/critic.ts`
- `src/workflows/demo-counter.ts`, `src/workflows/literature-review.ts`
- `adl.config.ts`

The **live playground config** also imports `outliner` / `writer` / `editor` / `research-assistant`, `write-article`, `answer-question`, and `src/prompts`. `src/adl.ts` imports `./env` and `./model`. `researcher.ts` imports `./conversation-title`. None of those files are in the init list.

Init currently copies the **full** playground `adl.config.ts` (name substitution only). A new project will fail to resolve modules.

**Direction (agreed with the “don’t put the stress-test in playground” constraint):**

1. **Stop treating playground as the init tree.** Keep playground as the monorepo UI/CLI demo (rich, allowed to grow).
2. Give `adl init` a **dedicated scaffold** (small `adl.config`, `src/adl.ts` + model wiring, demo-counter, one LLM workflow, `.env.example`). Tests must `tsc --noEmit` the generated tree.
3. Put the **complex stress-test** in `examples/` (or a sibling repo), **not** on the init file list. See [Stress-test example](#stress-test-example).

### 2. Cancellation does not stop in-flight work

`WorkflowImpl` checks `AbortSignal` only after the run body returns (or in `catch`). `WorkflowContext.step` never sees the signal. Child `agent.run` uses a **new** `AbortController`, not the parent’s.

UI “Cancel” marks the in-process handle aborted; the LLM call and remaining steps can still run to completion. Documented today as a known limitation.

**RC bar:** abort a step callback and any `streamText` started from that run (same signal, or linked controllers). Add unit tests.

### 3. No end-to-end proof of the published path

CI is lint / format / typecheck / **package unit tests** / build. It does **not**:

- Run `apps/web` tests (`*.test.ts` exist; `apps/web/package.json` has no `test` script, so Turbo skips them)
- Run `adl init` and typecheck the result
- Drive the inspector in a browser
- Run a live (or recorded) multi-agent workflow

---

## Remaining feature work (RC)

| Priority | Item                                                      | Notes                                                       |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| P0       | Dedicated `adl init` scaffold + tests                     | Independent of playground registry                          |
| P0       | Propagate cancel into steps + agents                      | Wire `AbortSignal`; tests for mid-step and mid-`streamText` |
| P1       | Wire `apps/web` tests into `turbo run test`               | Add `"test": "bun test src"` (or equivalent)                |
| P1       | Re-export `stepCountIs` from `@agent-dev-lab/core`        | Docs already tell authors to import it from `ai`            |
| P2       | Forward AI SDK `experimental_telemetry`                   | [`tracing.md`](./tracing.md)                                |
| P2       | Docs: inspection UI guide                                 | Starlight page under `guides/`                              |
| P2       | Replace `apps/web/README.md` TanStack boilerplate         | Match cli/docs READMEs                                      |
| P3       | Example OTel exporter in playground or docs               | Optional; core already starts spans                         |
| —        | Template playground, hooks package, live token debug pane | ⏸ not RC                                                    |

---

## Remaining validation

### Unit / contract (in-repo, no API key)

**Core — add or thicken:**

| Area                                                       | Today                                                | Gap                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Workflow run / skip / keys / nest / isolate / titles / Zod | `execute.test.ts`                                    | Cancel, `{ force: true }`, `step_failed`, output schema failure |
| Agent prompt / titles / commit counts                      | `agent-impl.test.ts`                                 | `agent.stream`, `outputSchema`, tools, abort                    |
| `createToolFromAgent` / `createToolFromWorkflow`           | none                                                 | ALS required; isolated vs nested                                |
| SQLite + in-memory store contract                          | `store.contract.test.ts`                             | Inspector session store                                         |
| Project load / env / reload / watch                        | `load.test.ts`, `load-env.test.ts`, `reload.test.ts` | Duplicate id errors are light                                   |
| Templates                                                  | `create.test.ts`                                     | —                                                               |

**CLI:** init currently asserts **file bytes match playground**, which encodes the broken coupling. After the dedicated scaffold, assert: generated `adl.config` only imports copied files, `tsc --noEmit` passes, `adl workflows list` works.

**Web:** many reducer/helper tests. Missing: they are not in CI. No component or browser tests.

### Integration (still no live LLM)

| Test                                                                         | Purpose                      |
| ---------------------------------------------------------------------------- | ---------------------------- |
| `adl init <tmpdir>` → `bun install` → `tsc --noEmit`                         | Scaffold is a real project   |
| `adl run demo-counter --input '{"steps":3}'` in that dir                     | CLI execution path           |
| `loadAdlProject` + `workflow.run` against playground with mock/no-LLM        | Registry + SQLite            |
| SSE helper already unit-tested; add a fetch against `vite` or Nitro if cheap | Event tail + terminal events |

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

**Why not playground:** `adl init` currently copies playground sources. A large “real” workflow in playground either bloats every new project or we keep playing whack-a-mole with `PLAYGROUND_SOURCE_FILES`. Playground stays the **framework-dev** target (`bun run dev:web`).

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

| Topic                     | Status                                  | Notes                                                      |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Model / provider setup    | ✅                                      | `createAdlRuntime({ defaults: { model } })` + env docs     |
| Workflow input validation | ✅                                      | Zod on `createWorkflow`; parsed at `run()`                 |
| Shared `tools` in config  | ✅                                      | Runtime `tools` merge; `adl.config.tools` is registry-only |
| Error types               | ✅                                      | `AdlError` + CLI messages (`DEBUG=adl` for stacks)         |
| Testing helpers           | ✅                                      | `createTestRuntime()`                                      |
| OTEL default observer     | ✅ spans; 🚧 no AI SDK telemetry option | App installs exporter                                      |
| Event schema versioning   | ✅                                      | `eventSchemaVersion: 1`                                    |
| Secrets / API keys        | ✅                                      | Document env vars only                                     |
| Human approval            | ⏸                                       | [`future-extensions.md`](./future-extensions.md)           |
| Memory pipeline           | ⏸                                       | [`memory-pipeline.md`](./memory-pipeline.md)               |
| Checkpoints               | ⏸                                       | [`resumability.md`](./resumability.md)                     |
| Workflow catalog grouping | ⏸                                       | [`workflow-catalog.md`](./workflow-catalog.md)             |

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
