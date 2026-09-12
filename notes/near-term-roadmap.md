# Near-term roadmap

Open work after the published core/web **0.0.3** / cli **0.0.5** surface. Design notes for deferred areas live in the linked files.

Last reconciled: **2026-09-12**.

---

## 1. Model switching

**Today:** the model is chosen once, on `AgentDefinition.model` or `createAdlRuntime({ defaults: { model } })`. There is no per-call override, no core `ADL_MODEL` (playground `src/model.ts` reads `ADL_OPENAI_MODEL` as an app convention), and the inspector Model section is a read-only `Agent.modelInfo` projection. `adl_agent_episodes.model_id` / `model_provider` stay empty until this lands.

**Decided (keep these; do not reopen without a new reason):**

- Resolution is `input.model ?? definition.model ?? defaults.model` — live `LanguageModel` only. Nothing is persisted for later reconstruction.
- No `agent.setModel()` / mutable per-instance model. Hot reload reconstructs agents, and one `Agent` is shared across concurrent conversations.
- Conversation-pinned model (per `memoryScope`) is deferred. Auto-pin would freeze the first model used; a stored pin also needs a catalog to turn `{ modelId, provider }` back into a factory.
- A model **catalog** is UI-only (picker → factory in `apps/web`). Core never consults it.
- Ship a read-only `{ modelId, provider }` descriptor on `agent_started` and `adl_agent_episodes` **with** the per-call override — otherwise a switch is unobservable. That is not a round-trip; do not invent a factory from those strings.

| Item                                       | Notes                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔲 Per-call `AgentRunInput.model`          | Thread through the resolution point in `AgentImpl`. After this, AI SDK `prepareStep` can return a different `model` per step if we want that later. |
| 🔲 Record `{ modelId, provider }` on start | Same change as the override. `inspectLanguageModel` already produces the strings.                                                                   |
| 🔲 Model catalog in `adl.config`           | e.g. `models: [{ id, label, provider, factory }]` for the picker. Not a core resolution input.                                                      |
| 🔲 Provider-key preflight                  | Flag a missing key before a run starts (CLI and UI).                                                                                                |
| 🔲 Inspector model picker                  | `agent-settings-panel.tsx` / composer — needs a write path; today `apps/web` is read/SSE only.                                                      |

---

## 2. Tools — remaining

Shipped in `@agent-dev-lab/tools`: file, bash (Linux native + ASRT), grep/glob, `fetchUrl`. Core still only has adapters + `ToolProvider`. Provider-native web search (`openai.tools.webSearch`) is the search path — do not build a second one. Details: [`tool-sandboxing.md`](./tool-sandboxing.md), [`packages/tools/README.md`](../packages/tools/README.md).

| Item                                        | Notes                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🚧 Approval dispatcher                      | File/bash without a gate is always-allow or always-deny. Pull [`future-extensions.md`](./future-extensions.md)'s `approvals.dispatcher` forward; scoped to tool calls, not `ctx.requestApproval`. |
| 🔲 Todo / plan-tracking tool                | `writeTodos` / `readTodos` — per-run state, no sandbox. **Open:** `packages/core` vs `packages/tools` (it does not share the trust-boundary rationale of file/bash/network).                      |
| 🔲 MCP client `ToolProvider`                | `@ai-sdk/mcp` `createMCPClient` → `ToolSet`; wrap as a `ToolProvider` in `@agent-dev-lab/tools` with the same no-unsafe-default posture as bash.                                                  |
| 🔲 `createNativeBashExecutor` macOS backend | `sandbox-exec`; needs a Mac. Default ASRT path is already cross-platform.                                                                                                                         |
| 🔲 `writeFile` parent-directory creation    | Known jail gap — `mkdir -p` needs a level-by-level check.                                                                                                                                         |
| 🔲 LSP diagnostics / find-references        | Heavier than shipped grep/glob; per-language server process.                                                                                                                                      |
| ✅ Tool-provider lifecycle                  | [`tool-provider-lifecycle.md`](./tool-provider-lifecycle.md) — hooks, pool, playground, HMR pin, and `apps/docs` reconciled.                                                                      |

---

## 3. Datasets of inputs

Run tagging and `version:` / `commit:` provenance are shipped (inspector footer; `WorkflowStore.listRuns({ tags })`). Still missing: a named set of inputs, batch run, side-by-side compare. CLI `adl workflow run` is single-input.

**Open:** organizational only (no scoring), or does this reopen the “no built-in evals” non-goal in [`future-extensions.md`](./future-extensions.md)? Treat as organization/comparison unless someone explicitly asks for scorers.

---

## 4. Other open work

| Item                                             | Where                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage / cost per agent call                      | here                                             | Token counts + estimate in the inspector; pairs with model switching and datasets                                                                                                                                                                                                                                                                                                                                            |
| Split `AgentImpl#executeTurn`                    | `packages/core/src/agent/agent-impl.ts`          | ~300-line nested closures; do this before more model/telemetry work lands in the same function                                                                                                                                                                                                                                                                                                                               |
| Live streaming / preliminary tool-result UI      | [`inspection-ui.md`](./inspection-ui.md)         | Core already emits `preliminary` `agent_tool_result`; chat shows a spinner until the final                                                                                                                                                                                                                                                                                                                                   |
| Loading animation while an agent turn is running | `apps/web` chat (`agent-run-workspace.tsx`)      | Composer disables while `sending` or `isRunning`. "Streaming…" / tool-row `Loader2` only appear after a text delta or a committed tool-call part. Between send and the first of those (first token, or a tool round with no assistant text yet) the transcript looks idle. Wanted: a visible running indicator for the whole turn, not only once stream/tool chrome exists. Distinct from the preliminary-result tail above. |
| Human approval (`ctx.requestApproval`)           | [`future-extensions.md`](./future-extensions.md) | Workflow-level pause; needs resume                                                                                                                                                                                                                                                                                                                                                                                           |
| Extension registry + tool-call hooks             | [`future-extensions.md`](./future-extensions.md) | `PreToolUse` / `PostToolUse` are side effects, not allow/deny                                                                                                                                                                                                                                                                                                                                                                |
| Memory pipeline                                  | [`memory-pipeline.md`](./memory-pipeline.md)     | Truncation / summarization before the model                                                                                                                                                                                                                                                                                                                                                                                  |
| Checkpoints / `WorkflowResumer` / `cacheable`    | [`resumability.md`](./resumability.md)           | Same-`runId` step skip is shipped; crash-safe re-entry is not                                                                                                                                                                                                                                                                                                                                                                |
| Workflow / agent catalog grouping                | [`workflow-catalog.md`](./workflow-catalog.md)   | Folders / tags / namespaced ids                                                                                                                                                                                                                                                                                                                                                                                              |
| Template playground, hooks package, token-debug  | [`inspection-ui.md`](./inspection-ui.md)         | Deferred inspector surfaces                                                                                                                                                                                                                                                                                                                                                                                                  |
| SQLite `EventLog`                                | `apps/docs` already says this                    | Process-wide log is in-memory only                                                                                                                                                                                                                                                                                                                                                                                           |
| Example OTel exporter                            | [`tracing.md`](./tracing.md)                     | Core already starts spans; playground/docs could show an exporter                                                                                                                                                                                                                                                                                                                                                            |
| Stress-test example under `examples/`            | below                                            | Not started                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Playwright / browser inspector tests in CI       | —                                                | No browser tests today                                                                                                                                                                                                                                                                                                                                                                                                       |

### Stress-test example (not started)

Do **not** grow `adl init` or playground for this. `examples/<name>/` at the repo root (own `adl.config.ts`) or a private sibling that depends on published packages.

One long run should combine: nested + isolated workflows, parallel keyed steps, a tool loop, structured output, file templates, `titleWorkflow`, `ctx.setTitle` / custom events, a real tool, and a fail-then-rerun with the same `workflowRunId`.

---

## Priority

| Priority | Item                                                                 |
| -------- | -------------------------------------------------------------------- |
| **P1**   | Per-call model override + episode `{ modelId, provider }` (§1)       |
| **P1**   | MCP client `ToolProvider` (§2)                                       |
| **P1**   | Approval dispatcher for file/bash (§2)                               |
| **P2**   | Model catalog + inspector picker (§1)                                |
| **P2**   | Todo tool — after core-vs-tools placement (§2)                       |
| **P2**   | Datasets / batch compare — after organizational-vs-evals (§3)        |
| **P2**   | Usage/cost tracking; `executeTurn` split (§4)                        |
| **P2**   | Live preliminary tool-result UI                                      |
| **P2**   | Loading animation while an agent turn is running (§4)                |
| **P3**   | macOS native bash; LSP tool; `writeFile` mkdir; deferred files above |
