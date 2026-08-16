import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

import type {
  AgentObserverEvent,
  RunEvent,
  RunEventEmit,
  WorkflowObserverEvent,
} from "../observability/events";
import { EVENT_SCHEMA_VERSION } from "../observability/events";
import type { RuntimeServices } from "./types";

const TRACER_NAME = "agent-dev-lab";

/**
 * ADL run-event sink: persists {@link RunEvent}s to {@link WorkflowStore} and mirrors
 * them on the active OTel span (workflow runs, steps, and agent episodes linked to a run).
 *
 * - **Workflow / step events** — always go through `RunRecorder` when a workflow store is configured.
 * - **Agent inside a workflow** — same path; events attach to the parent run for inspection UI.
 * - **Standalone agent conversations** — boundary tracing uses {@link withActiveSpan}; application
 *   code can use `@opentelemetry/api` directly. `RunRecorder` still persists agent episodes when a
 *   workflow store is present (optional history); it does not replace custom OTel instrumentation.
 *
 * `seq` is scoped to the event stream a consumer subscribes to: per `workflowRunId` for workflow
 * runs (all workflow + step + agent events share one counter), per `agentCallId` for standalone
 * agent episodes. Not globally unique — meaningful only within a single `listEvents` query scope.
 */
export class RunRecorder {
  private workflowSeq = 0;
  private agentSeq = 0;

  constructor(private readonly services: RuntimeServices) {}

  private now(): string {
    return new Date().toISOString();
  }

  /**
   * Records a run event (store, observers, OTel). Never rejects — failures are logged on the
   * active span, or `console.warn` if span recording fails.
   */
  async emit(event: RunEventEmit): Promise<void> {
    let withMeta: RunEvent;
    try {
      withMeta = this.attachMeta(event);
    } catch (error) {
      this.reportEmitFailure(error, event.type);
      return;
    }

    try {
      this.recordOnActiveSpan(withMeta);
    } catch (error) {
      this.reportEmitFailure(error, withMeta.type);
    }

    try {
      await this.persist(withMeta);
    } catch (error) {
      this.reportEmitFailure(error, withMeta.type);
    }

    try {
      await this.notifyObservers(withMeta);
    } catch (error) {
      this.reportEmitFailure(error, withMeta.type);
    }
  }

  private reportEmitFailure(error: unknown, eventType: string): void {
    try {
      recordSpanError(error);
    } catch (loggingError) {
      console.warn(
        `[agent-dev-lab] RunRecorder.emit(${eventType}) failed and could not record on span:`,
        error,
        loggingError,
      );
    }
  }

  private attachMeta(event: RunEventEmit): RunEvent {
    if ("workflowRunId" in event && event.workflowRunId) {
      return {
        ...event,
        seq: ++this.workflowSeq,
        at: this.now(),
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      } as RunEvent;
    }
    if ("agentCallId" in event) {
      return {
        ...event,
        seq: ++this.agentSeq,
        at: this.now(),
        eventSchemaVersion: EVENT_SCHEMA_VERSION,
      } as RunEvent;
    }
    return event as RunEvent;
  }

  private recordOnActiveSpan(event: RunEvent): void {
    if (event.type === "agent_text_delta") {
      return;
    }
    const span = trace.getActiveSpan();
    if (!span) {
      return;
    }
    span.addEvent(event.type, runEventAttributes(event));
  }

  private async persist(event: RunEvent): Promise<void> {
    const store = this.services.stores.workflow;
    if (!store) {
      return;
    }
    await store.recordEvent(event);
  }

  private async notifyObservers(event: RunEvent): Promise<void> {
    if (this.isWorkflowObserverEvent(event)) {
      await Promise.all(
        this.services.observers.workflows.map(async (observer) => {
          try {
            await observer.onEvent?.(event);
          } catch (error) {
            this.reportEmitFailure(error, event.type);
          }
        }),
      );
    }
    if (this.isAgentObserverEvent(event)) {
      await Promise.all(
        this.services.observers.agents.map(async (observer) => {
          try {
            await observer.onEvent?.(event);
          } catch (error) {
            this.reportEmitFailure(error, event.type);
          }
        }),
      );
    }
  }

  private isWorkflowObserverEvent(event: RunEvent): event is WorkflowObserverEvent {
    return (
      event.type === "workflow_started" ||
      event.type === "workflow_finished" ||
      event.type === "workflow_failed" ||
      event.type === "workflow_cancelled" ||
      event.type.startsWith("step_") ||
      event.type === "custom"
    );
  }

  private isAgentObserverEvent(event: RunEvent): event is AgentObserverEvent {
    return event.type.startsWith("agent_");
  }
}

export function withActiveSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: ReturnType<typeof trace.getActiveSpan>) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  const attrs = Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined;
    }),
  ) as Attributes;

  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function recordSpanError(error: unknown): void {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }
  if (error instanceof Error) {
    span.recordException(error);
  } else {
    span.recordException(new Error(String(error)));
  }
  span.setStatus({ code: SpanStatusCode.ERROR });
}

function runEventAttributes(event: RunEvent): Attributes {
  const attrs: Attributes = {
    "adl.event.type": event.type,
    "adl.event.at": event.at,
  };
  if ("workflowRunId" in event && event.workflowRunId) {
    attrs["adl.workflow_run_id"] = event.workflowRunId;
  }
  if ("stepId" in event && event.stepId !== undefined) {
    attrs["adl.step_id"] = event.stepId ?? "";
  }
  if ("agentCallId" in event) {
    attrs["adl.agent_call_id"] = event.agentCallId;
  }
  if ("agentId" in event && event.agentId) {
    attrs["adl.agent_id"] = event.agentId;
  }
  if ("workflowId" in event && event.workflowId) {
    attrs["adl.workflow_id"] = event.workflowId;
  }
  if ("name" in event && event.name) {
    attrs["adl.name"] = event.name;
  }
  if ("memoryScope" in event && event.memoryScope) {
    attrs["adl.memory_scope"] = event.memoryScope;
  }
  if ("status" in event && event.status) {
    attrs["adl.status"] = event.status;
  }
  return attrs;
}
