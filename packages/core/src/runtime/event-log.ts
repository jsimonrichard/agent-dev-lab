import type { AgentObserverEvent, RunEvent, WorkflowObserverEvent } from "../observability/events";
import type { RuntimeServices } from "./types";

export type EventLogScope = {
  workflowRunId?: string;
  agentCallId?: string;
};

export class EventLog {
  private workflowSeq = 0;
  private agentSeq = 0;

  constructor(
    private readonly services: RuntimeServices,
    private readonly scope: EventLogScope,
  ) {}

  private now(): string {
    return new Date().toISOString();
  }

  async emit(event: RunEvent): Promise<void> {
    const withMeta = this.attachMeta(event);
    await this.persist(withMeta);
    await this.fanOut(withMeta);
  }

  private attachMeta(event: RunEvent): RunEvent {
    if ("workflowRunId" in event && event.workflowRunId) {
      return {
        ...event,
        seq: ++this.workflowSeq,
        at: this.now(),
      };
    }
    if ("agentCallId" in event) {
      return {
        ...event,
        seq: ++this.agentSeq,
        at: this.now(),
      };
    }
    return event;
  }

  private async persist(event: RunEvent): Promise<void> {
    const store = this.services.stores.workflow;
    if (!store) {
      return;
    }
    try {
      await store.recordEvent(event);
    } catch (error) {
      console.error("[adl] WorkflowStore.recordEvent failed:", error);
    }
  }

  private async fanOut(event: RunEvent): Promise<void> {
    if (this.isWorkflowObserverEvent(event)) {
      await Promise.all(
        this.services.observers.workflows.map(async (observer) => {
          try {
            await observer.onEvent?.(event);
          } catch (error) {
            console.error("[adl] WorkflowObserver.onEvent failed:", error);
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
            console.error("[adl] AgentObserver.onEvent failed:", error);
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
