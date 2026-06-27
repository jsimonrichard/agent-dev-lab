# Tracing (OpenTelemetry)

How ADL fits with **OpenTelemetry** — no parallel tracing API in `@agent-dev-lab/core`.

**Status:** Design for v1. Runtime pre-instrumentation not implemented yet.

Related: [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts), [workflows guide](../apps/docs/src/content/docs/core/workflows.md), [`RunEvent`](../packages/core/src/observability/events.ts), [AI SDK notes](../packages/core/src/index.ts).

---

## Principle: native OTel, not an ADL wrapper

We **do not** ship `TraceContext`, `startSpan`, or other helpers that duplicate `@opentelemetry/api`. We don't know yet which convenience APIs would earn their keep.

Instead:

1. ADL **pre-instruments** workflow runs, steps, and agent episodes by **activating OpenTelemetry context** at those boundaries (when tracing is enabled).
2. Application code calls **OTel directly** — spans you create nest under the active ADL span.
3. Optional **observers** mirror the same boundaries via `WorkflowObserver.onEvent` / `AgentObserver.onEvent` if you want a custom exporter without OTel.

Install `@opentelemetry/api` (and your exporter SDK) in the **application** project, not in core.

---

## User code inside a workflow

```ts
import { trace } from "@opentelemetry/api";

await ctx.step("enrich", async () => {
  const tracer = trace.getTracer("my-app");
  const span = tracer.startSpan("fetch-metadata");
  try {
    // ...
  } finally {
    span.end();
  }
});
```

At workflow root (`ctx.stepId === null`), custom spans still nest under the **workflow** span once the runtime activates context for `workflow_started`.

---

## Span boundaries (planned)

| ADL boundary         | OTel span (conceptual) | Run event(s)                             |
| -------------------- | ---------------------- | ---------------------------------------- |
| `workflow.run`       | Root workflow span     | `workflow_started` / `workflow_finished` |
| `ctx.step`           | Child span per step    | `step_started` / `step_finished`         |
| `agent.run` / stream | Child span per episode | `agent_started` / `agent_finished`       |
| Tool execution       | Under agent span       | `agent_tool_call` / `agent_tool_result`  |
| User OTel calls      | Under active context   | (none — user-owned)                      |

Standalone `agent.run` (no `workflowRunId` on events) still gets an agent root span; it is not nested under a workflow span.

---

## Observers vs OTel SDK

| Approach                                 | When to use                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **OTel SDK** in workflow/agent code      | Custom attributes, child spans, integration with existing observability stack                                            |
| **`WorkflowObserver` / `AgentObserver`** | Push-only adapters (stdout, bespoke backends), or bridging {@link RunEvent} to another system                            |
| **Both**                                 | Common: ADL activates context for user OTel; an observer exports the same run events to SQLite/SSE for the inspection UI |

An OTel-backed observer can map `onEvent` payloads to spans without core exposing span types. See [`WorkflowStore`](../packages/core/src/observability/workflow-store.ts) and observers in `packages/core/src/observability/`.

---

## AI SDK

`generateText` / `streamText` support **`experimental_telemetry`** when the provider stack is configured.

The agent runner should forward the **active OTel context** into that option so model and tool spans nest under the ADL **agent** span.

See [AI SDK compatibility](../packages/core/src/index.ts) (`@packageDocumentation`).

---

## What we are not doing in core (v1)

- Re-exporting or wrapping `@opentelemetry/api`
- A `packages/core/src/observability/tracing.ts` helper module until a concrete need appears
- Requiring OTel for headless runs (tracing remains optional)

---

## v1 checklist

- [ ] Activate OTel context at workflow / step / agent boundaries in the runner
- [ ] Forward context into AI SDK `experimental_telemetry` on agent episodes
- [ ] Document env / config for enabling tracing in playground
- [ ] Example `OtelWorkflowObserver` in app or `@agent-dev-lab/common` (optional)
