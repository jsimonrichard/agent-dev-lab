import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowRunSummary,
} from "./events";
import type { ListEventsFilter, ListEventsScope, WorkflowStore } from "./workflow-store";

type StepKey = string;

function stepSlotKey(slot: StepSlot): StepKey {
  const keyPart = slot.key ?? "";
  return `${slot.parentStepId ?? "root"}:${slot.name}:${keyPart}`;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly eventsByWorkflowRun = new Map<string, RunEvent[]>();
  private readonly eventsByAgentCall = new Map<string, RunEvent[]>();
  private readonly runs = new Map<string, WorkflowRunSummary>();
  private readonly runInputs = new Map<string, unknown>();
  private readonly runOutputs = new Map<string, unknown>();
  private readonly stepOutputs = new Map<string, Map<StepKey, unknown>>();
  private readonly stepRecords = new Map<string, Map<string, StepRecord>>();

  async recordEvent(event: RunEvent): Promise<void> {
    if ("workflowRunId" in event && event.workflowRunId) {
      const wfId = event.workflowRunId;
      const list = this.eventsByWorkflowRun.get(wfId) ?? [];
      list.push(event);
      this.eventsByWorkflowRun.set(wfId, list);

      if (event.type === "workflow_started") {
        this.runs.set(wfId, {
          workflowRunId: wfId,
          workflowId: event.workflowId,
          status: "running",
          startedAt: event.at,
        });
        this.runInputs.set(wfId, event.input);
      }
      if (event.type === "workflow_finished") {
        const run = this.runs.get(wfId);
        if (run) {
          this.runs.set(wfId, { ...run, status: "ok", finishedAt: event.at });
        }
        this.runOutputs.set(wfId, event.output);
      }
      if (event.type === "workflow_failed") {
        const run = this.runs.get(wfId);
        if (run) {
          this.runs.set(wfId, { ...run, status: "error", finishedAt: event.at });
        }
      }
      if (event.type === "workflow_cancelled") {
        const run = this.runs.get(wfId);
        if (run) {
          this.runs.set(wfId, { ...run, status: "cancelled", finishedAt: event.at });
        }
      }
      if (event.type === "step_finished") {
        const slot: StepSlot = {
          parentStepId: event.parentStepId,
          name: event.name,
          key: event.key,
        };
        const map = this.stepOutputs.get(wfId) ?? new Map();
        map.set(stepSlotKey(slot), event.output);
        this.stepOutputs.set(wfId, map);

        const records = this.stepRecords.get(wfId) ?? new Map();
        records.set(event.stepId, {
          stepId: event.stepId,
          name: event.name,
          key: event.key,
          path: event.path,
          parentStepId: event.parentStepId,
          output: event.output,
          status: "ok",
        });
        this.stepRecords.set(wfId, records);
      }
      if (event.type === "step_failed") {
        const records = this.stepRecords.get(wfId) ?? new Map();
        records.set(event.stepId, {
          stepId: event.stepId,
          name: event.name,
          key: event.key,
          path: event.path,
          parentStepId: event.parentStepId,
          status: "error",
        });
        this.stepRecords.set(wfId, records);
      }
    }

    if ("agentCallId" in event) {
      const list = this.eventsByAgentCall.get(event.agentCallId) ?? [];
      list.push(event);
      this.eventsByAgentCall.set(event.agentCallId, list);
    }
  }

  async listEvents(scope: ListEventsScope, filter?: ListEventsFilter): Promise<RunEvent[]> {
    const list =
      "workflowRunId" in scope
        ? [...(this.eventsByWorkflowRun.get(scope.workflowRunId) ?? [])]
        : [...(this.eventsByAgentCall.get(scope.agentCallId) ?? [])];
    return applyEventFilter(list, filter);
  }

  async getLatestEvent<T extends RunEventType>(
    scope: ListEventsScope,
    type: T,
  ): Promise<RunEventOfType<T> | null> {
    const list = await this.listEvents(scope, { type });
    const last = list.at(-1);
    return (last as RunEventOfType<T> | undefined) ?? null;
  }

  async getRun(workflowRunId: string): Promise<WorkflowRunSummary | null> {
    return this.runs.get(workflowRunId) ?? null;
  }

  async listRuns(filter?: { workflowId?: string; limit?: number }): Promise<WorkflowRunSummary[]> {
    let list = [...this.runs.values()];
    if (filter?.workflowId) {
      list = list.filter((r) => r.workflowId === filter.workflowId);
    }
    if (filter?.limit) {
      list = list.slice(-filter.limit);
    }
    return list;
  }

  async getRunInput(workflowRunId: string): Promise<unknown | null> {
    return this.runInputs.get(workflowRunId) ?? null;
  }

  async getRunOutput(workflowRunId: string): Promise<unknown | null> {
    return this.runOutputs.get(workflowRunId) ?? null;
  }

  async getStepOutput(workflowRunId: string, slot: StepSlot): Promise<unknown | null> {
    const map = this.stepOutputs.get(workflowRunId);
    if (!map) {
      return null;
    }
    const value = map.get(stepSlotKey(slot));
    return value === undefined ? null : value;
  }

  async getStepById(workflowRunId: string, stepId: string): Promise<StepRecord | null> {
    return this.stepRecords.get(workflowRunId)?.get(stepId) ?? null;
  }
}

export function inMemoryWorkflowStore(): WorkflowStore {
  return new InMemoryWorkflowStore();
}

function applyEventFilter(events: RunEvent[], filter?: ListEventsFilter): RunEvent[] {
  let list = events;
  if (filter?.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    list = list.filter((e) => types.includes(e.type));
  }
  if (filter?.afterSeq !== undefined) {
    list = list.filter((e) => e.seq > filter.afterSeq!);
  }
  if (filter?.limit !== undefined) {
    list = list.slice(0, filter.limit);
  }
  return list;
}
