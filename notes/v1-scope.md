# v1 scope & gaps

Consolidated view of **designed** vs **implemented** vs **remaining** for a credible v1. Stable API docs: **`apps/docs`** (see [`README.md`](./README.md)).

**Legend:** ✅ done · 🚧 partial · 🔲 not started · ⏸ deferred

---

## Runtime (`@agent-dev-lab/core`)

| Item                                                                                | Status                             |
| ----------------------------------------------------------------------------------- | ---------------------------------- |
| `createAgent`, `createWorkflow`, `createTemplate`                                   | ✅                                 |
| `createAdlRuntime`, `adl.createAgent` / `createWorkflow`                            | ✅                                 |
| `workflow.run(input)` + internal context + `workflowRunId` on handle                | ✅                                 |
| `workflow.stream` live event tail                                                   | ✅                                 |
| `agent.run`, `agent.stream` (shared `streamText` core)                              | ✅                                 |
| `MessageStore` + `inMemoryMessageStore`                                             | ✅                                 |
| `WorkflowStore` + `inMemoryWorkflowStore`                                           | ✅                                 |
| SQLite `WorkflowStore` / `MessageStore` in `@agent-dev-lab/common`                  | 🔲                                 |
| `ctx.step` skip when stored output exists                                           | ✅                                 |
| `WorkflowObserver` / `AgentObserver` fan-out via `RunRecorder`                      | ✅                                 |
| `loadAdlProject` + `getWorkflow` / `getAgent` / `getTemplate` + duplicate id checks | ✅                                 |
| `createToolFromAgent` / `createToolFromWorkflow`                                    | ✅                                 |
| AI SDK re-exports (`generateText`, `streamText`, `tool`, `CoreMessage`, …)          | 🚧 (`stepCountIs` not re-exported) |
| Cancellation propagated through steps → agents                                      | 🚧                                 |
| `WorkflowResumer` / episode `cacheable`                                             | ⏸                                  |

Docs: [apps/docs/src/content/docs/core/](../apps/docs/src/content/docs/core/)

---

## CLI (`adl`)

| Item                                     | Status |
| ---------------------------------------- | ------ |
| `adl dev` (inspection UI)                | ✅     |
| `adl run <workflow-id> --input '{}'`     | 🔲     |
| `adl workflows list` / `adl agents list` | 🔲     |

---

## Inspection UI (`apps/web`)

| Item                                      | Status |
| ----------------------------------------- | ------ |
| Project banner (`/api/project`)           | ✅     |
| List runs from `WorkflowStore`            | 🔲     |
| Start run server fn → `{ workflowRunId }` | 🔲     |
| SSE `GET /api/runs/:id/events`            | 🔲     |
| Template playground                       | ⏸      |
| Live token view                           | ⏸      |
| `@agent-dev-lab/hooks`                    | ⏸      |

Design: [`inspection-ui.md`](./inspection-ui.md)

---

## Playground & docs

| Item                                                 | Status |
| ---------------------------------------------------- | ------ |
| Starlight guides + TypeDoc for implemented core APIs | ✅     |
| Sample agent + workflow in `apps/playground`         | ✅     |
| Playground `adl.config` registry arrays populated    | ✅     |

---

## Gaps — decide or implement for v1

| Topic                         | Status | Notes                                                        |
| ----------------------------- | ------ | ------------------------------------------------------------ |
| **Model / provider setup**    | 🔲     | Where `LanguageModel` comes from: `defaults`, env, per-agent |
| **Workflow input validation** | 🚧     | Zod on `createWorkflow`; parse at `run()` boundary TBD       |
| **Shared `tools` in config**  | 🔲     | `ToolSet` on config vs only on agents                        |
| **Error types**               | 🔲     | `AdlError`, step failure propagation, CLI messages           |
| **Testing helpers**           | 🔲     | `createTestRunContext`, mock model fixtures                  |
| **OTEL default observer**     | 🔲     | Package in common vs example — [`tracing.md`](./tracing.md)  |
| **Event schema versioning**   | 🔲     | `eventSchemaVersion` on run events                           |
| **Secrets / API keys**        | 🔲     | Document env vars only                                       |
| **Human approval**            | ⏸      | [`future-extensions.md`](./future-extensions.md)             |
| **Memory pipeline**           | ⏸      | [`memory-pipeline.md`](./memory-pipeline.md)                 |
| **Checkpoints**               | ⏸      | [`resumability.md`](./resumability.md)                       |

---

## Likely not v1

- Dynamic config registration
- `RunHandle`
- Auto workflow resume mid-closure
- Mid-stream token resume
- AI SDK WorkflowAgent / durable execution required path
- Evals / scorers in runtime
- Multi-tenant auth on run APIs

---

## Suggested v1 slice

**Ship path:** config load → `createAdlRuntime` → `workflow.run` → steps → `agent.run` → stores → `adl run` + minimal UI waterfall.

**Cut if needed:** SQLite (in-memory first), template playground UI, full cancellation UX.

**Current position:** headless runtime path is largely complete; product slice (playground demo, CLI run, inspection SSE) is not.
