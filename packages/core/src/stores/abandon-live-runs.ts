import { AdlError } from "../errors";
import { EVENT_SCHEMA_VERSION, isLiveWorkflowRunStatus } from "../observability/events";
import type { RunEvent } from "../observability/events";
import { serializeError } from "../internal/serialize-error";
import { runOwnerLiveness, type RunOwner } from "../runtime/run-owner";
import { nextRunSeq, nowIso } from "./suspend-records";
import type { WorkflowStore } from "./workflow-store";

/**
 * Why a live row cannot continue after this process starts: `workflow.run` /
 * `agent.run` are in-process closures. SQLite can keep `suspended` / `running`
 * projections, but there is no stack to unpark. Callers must seed a new attempt.
 */
export const PROCESS_RESTART_RUN_GONE =
  "Process restarted; this run's JavaScript closure is gone and cannot resume. Retry from a step.";

export type AbandonedLiveRuns = {
  workflowRunIds: string[];
  agentCallIds: string[];
  /**
   * Live rows owned by a process that may still be running them — another
   * live process on this host, or any process on another host — left as is.
   */
  leftLive: { workflowRunIds: string[]; agentCallIds: string[] };
};

/**
 * Terminalize every live workflow run and running agent episode on `store`
 * whose owning process is gone (exited, or recorded before run owners).
 *
 * Hosts call this **once per OS process** at boot (not from `createAdlRuntime` —
 * config reload reconstructs the runtime while in-flight closures are still
 * valid and store identity is pinned).
 *
 * Extends existing `recordEvent` / `listRuns` / `listAgentEpisodes`; does not
 * add WorkflowStore methods.
 */
export async function abandonLiveRunsLostOnRestart(
  store: WorkflowStore,
): Promise<AbandonedLiveRuns> {
  const at = nowIso();
  const error = serializeError(new AdlError("INVALID_CONTEXT", PROCESS_RESTART_RUN_GONE));
  const result: AbandonedLiveRuns = {
    workflowRunIds: [],
    agentCallIds: [],
    leftLive: { workflowRunIds: [], agentCallIds: [] },
  };

  const episodes = await store.listAgentEpisodes();
  for (const episode of episodes) {
    if (episode.status !== "running") {
      continue;
    }
    const seqScope = episode.workflowRunId
      ? await store.listEvents({ workflowRunId: episode.workflowRunId })
      : await store.listEvents({ agentCallId: episode.agentCallId });
    const started = seqScope.find(
      (event) => event.type === "agent_started" && event.agentCallId === episode.agentCallId,
    );
    if (!ownerIsGone(started)) {
      result.leftLive.agentCallIds.push(episode.agentCallId);
      continue;
    }
    await store.recordEvent({
      type: "agent_failed",
      agentCallId: episode.agentCallId,
      agentId: episode.agentId,
      ...(episode.workflowRunId ? { workflowRunId: episode.workflowRunId } : {}),
      ...(episode.stepId !== undefined ? { stepId: episode.stepId } : {}),
      error,
      runSeq: nextRunSeq(seqScope),
      at,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    result.agentCallIds.push(episode.agentCallId);
  }

  const runs = await store.listRuns();
  for (const run of runs) {
    if (!isLiveWorkflowRunStatus(run.status)) {
      continue;
    }
    const events = await store.listEvents({ workflowRunId: run.workflowRunId });
    const started = events.find((event) => event.type === "workflow_started");
    if (!ownerIsGone(started)) {
      result.leftLive.workflowRunIds.push(run.workflowRunId);
      continue;
    }
    await store.recordEvent({
      type: "workflow_failed",
      workflowRunId: run.workflowRunId,
      error,
      runSeq: nextRunSeq(events),
      at,
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    result.workflowRunIds.push(run.workflowRunId);
  }

  return result;
}

function ownerIsGone(started: RunEvent | undefined): boolean {
  const owner: RunOwner | undefined =
    started && (started.type === "workflow_started" || started.type === "agent_started")
      ? started.owner
      : undefined;
  return runOwnerLiveness(owner) === "gone";
}
