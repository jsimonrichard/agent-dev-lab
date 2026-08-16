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
| SQLite `WorkflowStore` / `MessageStore`                                             | ✅                                 |
| `ctx.step` skip when stored output exists                                           | ✅                                 |
| `WorkflowObserver` / `AgentObserver` fan-out via `RunRecorder`                      | ✅                                 |
| `loadAdlProject` + `getWorkflow` / `getAgent` / `getTemplate` + duplicate id checks | ✅                                 |
| `createToolFromAgent` / `createToolFromWorkflow`                                    | ✅                                 |
| `AdlError` + `createTestRuntime`                                                    | ✅                                 |
| `eventSchemaVersion` on persisted events                                            | ✅                                 |
| AI SDK re-exports (`generateText`, `streamText`, `tool`, `CoreMessage`, …)          | 🚧 (`stepCountIs` not re-exported) |
| Cancellation propagated through steps → agents                                      | 🚧                                 |
| `WorkflowResumer` / episode `cacheable`                                             | ⏸                                  |

Docs: [apps/docs/src/content/docs/core/](../apps/docs/src/content/docs/core/)

---

## CLI (`adl`)

| Item                                     | Status |
| ---------------------------------------- | ------ |
| `adl dev` (inspection UI)                | ✅     |
| `adl init`                               | ✅     |
| `adl run <workflow-id> --input '{}'`     | ✅     |
| `adl workflows list` / `adl agents list` | ✅     |

---

## Inspection UI (`apps/web`)

| Item                                      | Status |
| ----------------------------------------- | ------ |
| Project banner (`/api/project`)           | ✅     |
| List runs from `WorkflowStore`            | ✅     |
| Start run server fn → `{ workflowRunId }` | ✅     |
| SSE `GET /api/runs/:id/events`            | ✅     |
| Cancel in-process run                     | ✅     |
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

| Topic                         | Status | Notes                                                      |
| ----------------------------- | ------ | ---------------------------------------------------------- |
| **Model / provider setup**    | ✅     | `createAdlRuntime({ defaults: { model } })` + env docs     |
| **Workflow input validation** | ✅     | Zod on `createWorkflow`; parsed at `run()`                 |
| **Shared `tools` in config**  | ✅     | Runtime `tools` merge; `adl.config.tools` is registry-only |
| **Error types**               | ✅     | `AdlError` + CLI messages (`DEBUG=adl` for stacks)         |
| **Testing helpers**           | ✅     | `createTestRuntime()`                                      |
| **OTEL default observer**     | ✅     | `RunRecorder` mirrors events; app installs exporter        |
| **Event schema versioning**   | ✅     | `eventSchemaVersion: 1`                                    |
| **Secrets / API keys**        | ✅     | Document env vars only                                     |
| **Human approval**            | ⏸      | [`future-extensions.md`](./future-extensions.md)           |
| **Memory pipeline**           | ⏸      | [`memory-pipeline.md`](./memory-pipeline.md)               |
| **Checkpoints**               | ⏸      | [`resumability.md`](./resumability.md)                     |

---

## Likely not v1

- Dynamic config registration
- `RunHandle`
- Auto workflow resume mid-closure
- Mid-stream token resume
- AI SDK WorkflowAgent / durable execution required path
- Evals / scorers in runtime
- Multi-tenant auth on run APIs
