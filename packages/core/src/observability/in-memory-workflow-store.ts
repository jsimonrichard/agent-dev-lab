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

export function inMemoryWorkflowStore(): WorkflowStore {
  const eventsByWorkflowRun = new Map<string, RunEvent[]>();
  const eventsByAgentCall = new Map<string, RunEvent[]>();
  const runs = new Map<string, WorkflowRunSummary>();
  const runInputs = new Map<string, unknown>();
  const runOutputs = new Map<string, unknown>();
  const stepOutputs = new Map<string, Map<StepKey, unknown>>();
  const stepRecords = new Map<string, Map<string, StepRecord>>();

  return {
    async recordEvent(event: RunEvent) {
      if ("workflowRunId" in event && event.workflowRunId) {
        const wfId = event.workflowRunId;
        const list = eventsByWorkflowRun.get(wfId) ?? [];
        list.push(event);
        eventsByWorkflowRun.set(wfId, list);

        if (event.type === "workflow_started") {
          runs.set(wfId, {
            workflowRunId: wfId,
            workflowId: event.workflowId,
            status: "running",
            startedAt: event.at,
          });
          runInputs.set(wfId, event.input);
        }
        if (event.type === "workflow_finished") {
          const run = runs.get(wfId);
          if (run) {
            runs.set(wfId, { ...run, status: "ok", finishedAt: event.at });
          }
          runOutputs.set(wfId, event.output);
        }
        if (event.type === "workflow_failed") {
          const run = runs.get(wfId);
          if (run) {
            runs.set(wfId, { ...run, status: "error", finishedAt: event.at });
          }
        }
        if (event.type === "workflow_cancelled") {
          const run = runs.get(wfId);
          if (run) {
            runs.set(wfId, { ...run, status: "cancelled", finishedAt: event.at });
          }
        }
        if (event.type === "step_finished") {
          const started = findStepStarted(list, event.stepId);
          if (started) {
            const slot: StepSlot = {
              parentStepId: started.parentStepId,
              name: started.name,
              key: started.key,
            };
            const map = stepOutputs.get(wfId) ?? new Map();
            map.set(stepSlotKey(slot), event.output);
            stepOutputs.set(wfId, map);

            const records = stepRecords.get(wfId) ?? new Map();
            records.set(event.stepId, {
              stepId: event.stepId,
              name: started.name,
              key: started.key,
              path: started.path,
              parentStepId: started.parentStepId,
              output: event.output,
              status: "ok",
            });
            stepRecords.set(wfId, records);
          }
        }
        if (event.type === "step_failed") {
          const started = findStepStarted(list, event.stepId);
          if (started) {
            const records = stepRecords.get(wfId) ?? new Map();
            records.set(event.stepId, {
              stepId: event.stepId,
              name: started.name,
              key: started.key,
              path: started.path,
              parentStepId: started.parentStepId,
              status: "error",
            });
            stepRecords.set(wfId, records);
          }
        }
      }

      if ("agentCallId" in event) {
        const list = eventsByAgentCall.get(event.agentCallId) ?? [];
        list.push(event);
        eventsByAgentCall.set(event.agentCallId, list);
      }
    },

    async listEvents(scope: ListEventsScope, filter?: ListEventsFilter) {
      const list =
        "workflowRunId" in scope
          ? [...(eventsByWorkflowRun.get(scope.workflowRunId) ?? [])]
          : [...(eventsByAgentCall.get(scope.agentCallId) ?? [])];
      return applyEventFilter(list, filter);
    },

    async getLatestEvent<T extends RunEventType>(scope: ListEventsScope, type: T) {
      const list = await this.listEvents(scope, { type });
      const last = list.at(-1);
      return (last as RunEventOfType<T> | undefined) ?? null;
    },

    async getRun(workflowRunId) {
      return runs.get(workflowRunId) ?? null;
    },

    async listRuns(filter) {
      let list = [...runs.values()];
      if (filter?.workflowId) {
        list = list.filter((r) => r.workflowId === filter.workflowId);
      }
      if (filter?.limit) {
        list = list.slice(-filter.limit);
      }
      return list;
    },

    async getRunInput(workflowRunId) {
      return runInputs.get(workflowRunId) ?? null;
    },

    async getRunOutput(workflowRunId) {
      return runOutputs.get(workflowRunId) ?? null;
    },

    async getStepOutput(workflowRunId, slot) {
      const map = stepOutputs.get(workflowRunId);
      if (!map) {
        return null;
      }
      const value = map.get(stepSlotKey(slot));
      return value === undefined ? null : value;
    },

    async getStepById(workflowRunId, stepId) {
      return stepRecords.get(workflowRunId)?.get(stepId) ?? null;
    },
  };
}

function findStepStarted(
  events: RunEvent[],
  stepId: string,
): Extract<RunEvent, { type: "step_started" }> | undefined {
  return events.find(
    (e): e is Extract<RunEvent, { type: "step_started" }> =>
      e.type === "step_started" && e.stepId === stepId,
  );
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
