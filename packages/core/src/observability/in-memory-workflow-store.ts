import type {
  RunEvent,
  RunEventOfType,
  RunEventType,
  StepRecord,
  StepSlot,
  WorkflowRunSummary,
} from "./events";
import type {
  AgentEpisodeSummary,
  ListEventsFilter,
  ListEventsScope,
  WorkflowStore,
} from "./workflow-store";

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
        const existing = this.runs.get(wfId);
        this.runs.set(wfId, {
          workflowRunId: wfId,
          workflowId: event.workflowId,
          status: "running",
          startedAt: event.at,
          title: existing?.title,
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
      if (event.type === "workflow_title_set") {
        const run = this.runs.get(wfId);
        if (run) {
          this.runs.set(wfId, { ...run, title: event.title });
        } else {
          this.runs.set(wfId, {
            workflowRunId: wfId,
            workflowId: "",
            status: "running",
            startedAt: event.at,
            title: event.title,
          });
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

  async setRunTitle(workflowRunId: string, title: string): Promise<void> {
    const run = this.runs.get(workflowRunId);
    if (run) {
      this.runs.set(workflowRunId, { ...run, title });
      return;
    }
    this.runs.set(workflowRunId, {
      workflowRunId,
      workflowId: "",
      status: "running",
      startedAt: new Date().toISOString(),
      title,
    });
  }

  async deleteRun(workflowRunId: string): Promise<void> {
    const events = this.eventsByWorkflowRun.get(workflowRunId) ?? [];
    for (const event of events) {
      if ("agentCallId" in event) {
        this.eventsByAgentCall.delete(event.agentCallId);
      }
    }
    this.eventsByWorkflowRun.delete(workflowRunId);
    this.runs.delete(workflowRunId);
    this.runInputs.delete(workflowRunId);
    this.runOutputs.delete(workflowRunId);
    this.stepOutputs.delete(workflowRunId);
    this.stepRecords.delete(workflowRunId);
  }

  async listAgentEpisodes(filter?: {
    agentId?: string;
    limit?: number;
  }): Promise<AgentEpisodeSummary[]> {
    const episodes: AgentEpisodeSummary[] = [];
    for (const list of this.eventsByAgentCall.values()) {
      const started = list.find((event) => event.type === "agent_started");
      if (!started || started.type !== "agent_started") {
        continue;
      }
      if (filter?.agentId && started.agentId !== filter.agentId) {
        continue;
      }
      episodes.push({
        agentCallId: started.agentCallId,
        agentId: started.agentId,
        memoryScope: started.memoryScope,
        startedAt: started.at,
        workflowRunId: started.workflowRunId,
        stepId: started.stepId,
      });
    }
    episodes.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (filter?.limit !== undefined) {
      return episodes.slice(0, filter.limit);
    }
    return episodes;
  }
}

/**
 * In-process {@link WorkflowStore} for tests and the default when `createAdlRuntime()`
 * omits `stores.workflow`.
 */
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
