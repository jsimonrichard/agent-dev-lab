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
import type {
  AttemptRunMaterialization,
  AttemptStepMaterialization,
} from "../workflow/retry-attempt";
import { seedRetryAttemptOnStore } from "../workflow/retry-attempt";
import { stepSlotKey } from "../db/projections/step-records";

type StepKey = string;

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly eventsByWorkflowRun = new Map<string, RunEvent[]>();
  private readonly eventsByAgentCall = new Map<string, RunEvent[]>();
  /** Conversation-scoped events only — see `ConversationEventBase`. */
  private readonly eventsByMemoryScope = new Map<string, RunEvent[]>();
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
          tags: event.tags ?? existing?.tags ?? [],
          parentWorkflowRunId: event.parentWorkflowRunId ?? null,
          parentStepId: event.parentStepId ?? null,
          retriesFromRunId: event.retriesFromRunId ?? null,
          replayOfRunId: event.replayOfRunId ?? null,
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
            tags: [],
            parentWorkflowRunId: null,
            parentStepId: null,
          });
        }
      }
      if (event.type === "step_finished") {
        const slot: StepSlot = { path: event.path };
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
          pure: event.pure === false ? false : true,
          replayOfStepId: event.replayOfStepId,
          memoryScopes: event.memoryScopes,
          memorySnapshots: event.memorySnapshots,
        });
        this.stepRecords.set(wfId, records);
      }
      if (event.type === "step_skipped") {
        const slot: StepSlot = { path: event.path };
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
          pure: true,
          replayOfStepId: event.replayOfStepId,
          memoryScopes: event.memoryScopes,
          memorySnapshots: event.memorySnapshots,
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
          pure: event.pure === false ? false : true,
          replayOfStepId: event.replayOfStepId,
          memoryScopes: event.memoryScopes,
        });
        this.stepRecords.set(wfId, records);
      }
    }

    if ("agentCallId" in event) {
      const list = this.eventsByAgentCall.get(event.agentCallId) ?? [];
      list.push(event);
      this.eventsByAgentCall.set(event.agentCallId, list);
    }

    if (event.type === "conversation_forked") {
      const list = this.eventsByMemoryScope.get(event.memoryScope) ?? [];
      list.push(event);
      this.eventsByMemoryScope.set(event.memoryScope, list);
    }
  }

  async listEvents(scope: ListEventsScope, filter?: ListEventsFilter): Promise<RunEvent[]> {
    const list = [...this.scopedEvents(scope)];
    return applyEventFilter(list, filter);
  }

  private scopedEvents(scope: ListEventsScope): RunEvent[] {
    if ("workflowRunId" in scope) {
      return this.eventsByWorkflowRun.get(scope.workflowRunId) ?? [];
    }
    if ("agentCallId" in scope) {
      return this.eventsByAgentCall.get(scope.agentCallId) ?? [];
    }
    return this.eventsByMemoryScope.get(scope.memoryScope) ?? [];
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

  async listRuns(filter?: {
    workflowId?: string;
    limit?: number;
    tags?: string[];
    parentWorkflowRunId?: string;
    rootsOnly?: boolean;
  }): Promise<WorkflowRunSummary[]> {
    let list = [...this.runs.values()];
    if (filter?.workflowId) {
      list = list.filter((r) => r.workflowId === filter.workflowId);
    }
    if (filter?.rootsOnly) {
      list = list.filter((r) => r.parentWorkflowRunId == null);
    } else if (filter?.parentWorkflowRunId !== undefined) {
      list = list.filter((r) => r.parentWorkflowRunId === filter.parentWorkflowRunId);
    }
    if (filter?.tags?.length) {
      const tags = filter.tags;
      list = list.filter((r) => tags.some((tag) => r.tags.includes(tag)));
    }
    if (filter?.limit) {
      list = list.slice(-filter.limit);
    }
    return list;
  }

  async listDescendantRuns(workflowRunId: string): Promise<WorkflowRunSummary[]> {
    const descendants: WorkflowRunSummary[] = [];
    const queue = [workflowRunId];
    const seen = new Set<string>([workflowRunId]);
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const child of await this.listRuns({ parentWorkflowRunId: parentId })) {
        if (seen.has(child.workflowRunId)) {
          continue;
        }
        seen.add(child.workflowRunId);
        descendants.push(child);
        queue.push(child.workflowRunId);
      }
    }
    return descendants;
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

  async listStepRecords(workflowRunId: string): Promise<StepRecord[]> {
    const map = this.stepRecords.get(workflowRunId);
    if (!map) {
      return [];
    }
    return [...map.values()];
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
      tags: [],
      parentWorkflowRunId: null,
      parentStepId: null,
    });
  }

  async setRunTags(workflowRunId: string, tags: string[]): Promise<void> {
    const run = this.runs.get(workflowRunId);
    if (run) {
      this.runs.set(workflowRunId, { ...run, tags });
      return;
    }
    this.runs.set(workflowRunId, {
      workflowRunId,
      workflowId: "",
      status: "running",
      startedAt: new Date().toISOString(),
      tags,
      parentWorkflowRunId: null,
      parentStepId: null,
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
      const finished = list.find(
        (event) => event.type === "agent_finished" || event.type === "agent_failed",
      );
      episodes.push({
        agentCallId: started.agentCallId,
        agentId: started.agentId,
        memoryScope: started.memoryScope,
        startedAt: started.at,
        workflowRunId: started.workflowRunId,
        stepId: started.stepId,
        status: finished ? (finished.type === "agent_finished" ? "ok" : "error") : "running",
        finishedAt: finished?.at,
        ...(started.toolProviderContext !== undefined
          ? { toolProviderContext: started.toolProviderContext }
          : {}),
        ...(finished?.type === "agent_finished" && finished.usage ? { usage: finished.usage } : {}),
      });
    }
    episodes.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (filter?.limit !== undefined) {
      return episodes.slice(0, filter.limit);
    }
    return episodes;
  }

  seedRetryAttempt(args: Parameters<WorkflowStore["seedRetryAttempt"]>[0]) {
    return seedRetryAttemptOnStore(this, args);
  }

  async materializeAttemptRun(run: AttemptRunMaterialization): Promise<void> {
    this.runs.set(run.workflowRunId, {
      workflowRunId: run.workflowRunId,
      workflowId: run.workflowId,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      title: run.title,
      tags: [...run.tags],
      parentWorkflowRunId: run.parentWorkflowRunId ?? null,
      parentStepId: run.parentStepId ?? null,
      retriesFromRunId: run.retriesFromRunId ?? null,
      replayOfRunId: run.replayOfRunId ?? null,
    });
    if (run.input !== undefined) {
      this.runInputs.set(run.workflowRunId, run.input);
    }
    if (run.output !== undefined) {
      this.runOutputs.set(run.workflowRunId, run.output);
    }
  }

  async materializeAttemptStep(step: AttemptStepMaterialization): Promise<void> {
    const records = this.stepRecords.get(step.workflowRunId) ?? new Map();
    records.set(step.stepId, {
      stepId: step.stepId,
      name: step.name,
      key: step.key,
      path: step.path,
      parentStepId: step.parentStepId,
      output: step.output,
      status: step.status,
      pure: step.pure,
      replayOfStepId: step.replayOfStepId,
      memoryScopes: step.memoryScopes,
      memorySnapshots: step.memorySnapshots,
    });
    this.stepRecords.set(step.workflowRunId, records);

    if (step.status === "ok" && step.output !== undefined) {
      const map = this.stepOutputs.get(step.workflowRunId) ?? new Map();
      map.set(stepSlotKey({ path: step.path }), step.output);
      this.stepOutputs.set(step.workflowRunId, map);
    }
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
    list = list.filter((e) => e.runSeq > filter.afterSeq!);
  }
  if (filter?.limit !== undefined) {
    list = list.slice(0, filter.limit);
  }
  return list;
}
