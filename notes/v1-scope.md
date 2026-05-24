# v1 scope & gaps (draft)

Consolidated view of what we have **designed** vs what still needs a decision or implementation before a credible v1. Detail lives in linked notes—not duplicated here.

**Legend:** ✅ discussed · 🔲 not discussed or thin · ⏸ explicitly deferred

---

## Designed (in notes)

| Area | Doc | v1 intent |
|------|-----|-----------|
| Agents | [`agent-api.md`](./agent-api.md) | `createAgent`, `run` / `stream`, context, memoryScope |
| Workflows | [`workflow-api.md`](./workflow-api.md) | `createWorkflow`, `ctx.step`, keys, `{ ctx }` nesting |
| Templates | [`templates-api.md`](./templates-api.md) | `createTemplate` + Zod + `.render()` |
| Project config | [`project-api.md`](./project-api.md) | arrays, `stores.*`, `observers.*`, `getWorkflow` |
| Message memory | [`message-store.md`](./message-store.md) | `MessageStore` load/save |
| Run persistence | [`observability-api.md`](./observability-api.md) | observers vs `WorkflowStore` |
| Streaming / UI feed | [`streaming-api.md`](./streaming-api.md) | run events, SSE, `ctx.emit` custom |
| Resumability | [`resumability.md`](./resumability.md) | step atomicity; ⏸ episode cache |
| AI SDK | [`ai-sdk-compatibility.md`](./ai-sdk-compatibility.md) | checklist |
| Memory pipeline | [`memory-pipeline.md`](./memory-pipeline.md) | ⏸ deferred |

---

## Runtime (`@agent-dev-lab/runtime`) — implement for v1

- [ ] `createAgent`, `createWorkflow`, `createTemplate`
- [ ] `createRunContext`, `workflow.run(input, ctx | { project })`
- [ ] `agent.run`, `agent.stream` (shared `streamText` core)
- [ ] `MessageStore` + `inMemory`; optional `stores.memory` SQLite in common
- [ ] `WorkflowStore` + default SQLite; `record*` / `getRunEvents`
- [ ] `WorkflowObserver` / `AgentObserver` fan-out
- [ ] Extend `loadAdlProject` + `getWorkflow` / `getAgent` / duplicate `id` checks
- [ ] Re-exports per AI SDK checklist

---

## CLI (`adl`) — implement for v1

- [ ] `adl run <workflow-id> --input '{}'`
- [ ] `adl workflows list` / `adl agents list` (ids from config arrays)
- [ ] Existing `adl dev` loads project name; 🔲 wire “trigger run” later

---

## Inspection UI (`apps/web`) — implement for v1 (minimal)

- [ ] Project banner (existing `/api/project`)
- [ ] List runs (`WorkflowStore.listRuns` or equivalent)
- [ ] SSE `/api/runs/:id/events` — waterfall from step events
- [ ] ⏸ template playground ([`templates-api.md`](./templates-api.md))
- [ ] ⏸ live token view (nice; `text_delta` events help)

---

## Playground & docs

- [ ] Update `apps/playground/adl.config.ts` to new shape (arrays, stores)
- [ ] Sample `createWorkflow` + `createAgent` + one end-to-end run
- [ ] Starlight: link to notes or generated API docs

---

## Gaps — discuss or decide for v1

| Topic | Status | Notes |
|-------|--------|-------|
| **Model / provider setup** | 🔲 thin | Where `LanguageModel` comes from: `adl.config.defaults`, env, per-agent field |
| **Workflow `run` input validation** | 🔲 implied | Zod on `createWorkflow`; who calls `.parse` — runner at `run()` boundary |
| **Shared `tools` in config** | 🔲 | `ToolSet` on config vs only on agents |
| **Templates registry** | 🔲 | array + `id` vs omit from config v1 |
| **Error types** | 🔲 | `AdlError`, step failure propagation, user-facing CLI messages |
| **Testing helpers** | 🔲 | `createTestRunContext`, in-memory store/observers bundle |
| **Workflow tool-loop helper** | 🔲 | Optional `runAgentToolLoop` in runtime vs raw TS in workflow |
| **OTEL default observer** | 🔲 | Package in common vs example only |
| **Event schema versioning** | 🔲 | `eventSchemaVersion` on run events for UI |
| **Secrets / API keys** | 🔲 | Document env vars only; no ADL vault v1 |
| **Export map** | 🔲 | `@agent-dev-lab/runtime`, `/project` subpath — already started |
| **Cancellation UX** | partial | `AbortSignal` documented; CLI/UI cancel 🔲 |
| **agent.stream in v1?** | partial | Designed; could ship `run` only first |
| **WorkflowResumer** | ⏸ | interface later |
| **Episode cache `cacheable`** | ⏸ | [`resumability.md`](./resumability.md) |
| **Memory pipeline** | ⏸ | [`memory-pipeline.md`](./memory-pipeline.md) |
| **Checkpoints** | ⏸ | [`resumability.md`](./resumability.md) |

---

## Likely **not** v1 (explicit)

- Dynamic config registration
- `RunHandle`
- Auto workflow resume mid-closure
- Mid-stream token resume
- AI SDK WorkflowAgent / durable execution required path
- Template preview UI (unless trivial)
- Multi-tenant auth on run APIs

---

## Suggested v1 slice (opinion)

**Ship path:** config load → `createRunContext` → `workflow.run` → steps → `agent.run` → `MessageStore` + `WorkflowStore` → `adl run` + minimal UI waterfall.

**Cut if needed:** `agent.stream`, SQLite (in-memory only first), custom `ctx.emit` in UI, templates registry in config.

---

## Open questions for you

1. Default **model** wiring in `adl.config`?
2. Is **`agent.stream`** required for v1 or fast-follow?
3. **Templates** in config array for v1 or only inline in agents/workflows?
4. **Workflow input validation** — fail at `run()` or trust TS?
