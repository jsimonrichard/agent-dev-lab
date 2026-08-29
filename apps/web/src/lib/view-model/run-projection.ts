import type { AgentEpisode, RunEvent, RunViewState, StepNode, StepNodeStatus } from "./types";
import { formatMemoryScopeLabel } from "../memory-scope-label";

function formatStepLabel(name: string, key?: string): string {
  return key ? `${name}:${key}` : name;
}

function upsertStep(
  map: Map<string, StepNode>,
  roots: StepNode[],
  event: Extract<RunEvent, { type: "step_started" }>,
): StepNode {
  const existing = map.get(event.stepId);
  if (existing) return existing;

  const node: StepNode = {
    stepId: event.stepId,
    parentStepId: event.parentStepId,
    name: event.name,
    key: event.key,
    path: event.path,
    status: "running",
    startedAt: event.at,
    children: [],
    agentEpisodes: [],
  };
  map.set(event.stepId, node);

  if (event.parentStepId) {
    const parent = map.get(event.parentStepId);
    if (parent) parent.children.push(node);
  } else {
    roots.push(node);
  }
  return node;
}

function findEpisode(node: StepNode, episodeId: string): AgentEpisode | undefined {
  return node.agentEpisodes.find((e) => e.episodeId === episodeId);
}

function durationFromSpan(
  startedAt: string | undefined,
  endedAt: string,
  fallbackMs?: number,
): number | undefined {
  if (startedAt) {
    const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
    if (Number.isFinite(durationMs) && durationMs >= 0) return durationMs;
  }
  return fallbackMs != null && fallbackMs > 0 ? fallbackMs : undefined;
}

function settleOpenWork(
  stepMap: Map<string, StepNode>,
  as: "failed" | "completed",
  settledAt: string,
): void {
  for (const step of stepMap.values()) {
    if (step.status === "running") {
      step.status = as;
      step.finishedAt ??= settledAt;
      step.durationMs ??= durationFromSpan(step.startedAt, settledAt);
    }
    for (const episode of step.agentEpisodes) {
      if (episode.status === "running") {
        episode.status = as;
        episode.finishedAt ??= settledAt;
        episode.durationMs ??= durationFromSpan(episode.startedAt, settledAt);
      }
    }
  }
}

/**
 * Pure reducer over RunEvents — mirrors notes/inspection-ui.md sketch.
 * Wire to SSE batches later.
 */
export function buildRunViewState(runId: string, events: RunEvent[]): RunViewState {
  const stepMap = new Map<string, StepNode>();
  const roots: StepNode[] = [];

  let workflowId = "unknown";
  let status: RunViewState["status"] = "running";
  let input: unknown = {};
  let output: unknown;
  let error: unknown;
  let startedAt = new Date().toISOString();
  let finishedAt: string | undefined;
  let lastSeq = 0;
  let title: string | undefined;

  for (const event of events) {
    if (event.seq <= lastSeq) continue;
    lastSeq = event.seq;

    switch (event.type) {
      case "run_started":
        workflowId = event.workflowId;
        input = event.input;
        startedAt = event.at;
        status = "running";
        break;
      case "step_started":
        upsertStep(stepMap, roots, event);
        break;
      case "step_finished": {
        const step = stepMap.get(event.stepId);
        if (step) {
          step.status = "completed";
          step.durationMs = event.durationMs;
          step.finishedAt = event.at;
          step.output = event.output;
        }
        break;
      }
      case "agent_started": {
        const step = stepMap.get(event.stepId);
        if (step) {
          step.agentEpisodes.push({
            episodeId: event.episodeId,
            agentId: event.agentId,
            memoryScope: event.memoryScope,
            status: "running",
            startedAt: event.at,
            streamingText: "",
            warnings: [],
          });
        }
        break;
      }
      case "agent_finished": {
        const step = stepMap.get(event.stepId);
        const ep = step ? findEpisode(step, event.episodeId) : undefined;
        if (ep) {
          ep.status = "completed";
          ep.finishedAt = event.at;
          ep.durationMs = durationFromSpan(ep.startedAt, event.at, event.durationMs);
        }
        break;
      }
      case "agent_warning": {
        const step = stepMap.get(event.stepId);
        const ep = step ? findEpisode(step, event.episodeId) : undefined;
        if (ep) {
          ep.warnings.push(event.message);
        }
        break;
      }
      case "agent_failed": {
        const step = stepMap.get(event.stepId);
        const ep = step ? findEpisode(step, event.episodeId) : undefined;
        if (ep) {
          ep.status = "failed";
          ep.error = event.error;
          ep.finishedAt = event.at;
          ep.durationMs ??= durationFromSpan(ep.startedAt, event.at);
        }
        break;
      }
      case "text_delta": {
        const step = stepMap.get(event.stepId);
        const ep = step ? findEpisode(step, event.episodeId) : undefined;
        if (ep) ep.streamingText += event.delta;
        break;
      }
      case "run_finished":
        status = "completed";
        output = event.output;
        finishedAt = event.at;
        settleOpenWork(stepMap, "completed", event.at);
        break;
      case "run_failed":
        status = "failed";
        error = event.error;
        finishedAt = event.at;
        settleOpenWork(stepMap, "failed", event.at);
        break;
      case "run_cancelled":
        status = "cancelled";
        finishedAt = event.at;
        settleOpenWork(stepMap, "completed", event.at);
        break;
      case "run_title_set":
        title = event.title;
        break;
      case "step_failed": {
        const step = stepMap.get(event.stepId);
        if (step) {
          step.status = "failed";
          step.error = event.error;
          step.finishedAt = event.at;
          step.durationMs ??= durationFromSpan(step.startedAt, event.at);
          for (const episode of step.agentEpisodes) {
            if (episode.status === "running") {
              episode.status = "failed";
              episode.error ??= event.error;
              episode.finishedAt ??= event.at;
              episode.durationMs ??= durationFromSpan(episode.startedAt, event.at);
            }
          }
        }
        break;
      }
      case "messages_committed":
        break;
    }
  }

  return {
    runId,
    workflowId,
    status,
    input,
    output,
    error,
    lastSeq,
    steps: roots,
    startedAt,
    finishedAt,
    title,
  };
}

export function findStepInTree(steps: StepNode[], stepId: string): StepNode | undefined {
  for (const step of steps) {
    if (step.stepId === stepId) return step;
    const nested = findStepInTree(step.children, stepId);
    if (nested) return nested;
  }
  return undefined;
}

export function findEpisodeInTree(
  steps: StepNode[],
  episodeId: string,
): { step: StepNode; episode: AgentEpisode } | undefined {
  for (const step of steps) {
    const episode = step.agentEpisodes.find((item) => item.episodeId === episodeId);
    if (episode) {
      return { step, episode };
    }
    const nested = findEpisodeInTree(step.children, episodeId);
    if (nested) return nested;
  }
  return undefined;
}

function findFirstEpisodeStep(steps: StepNode[]): StepNode | undefined {
  for (const step of steps) {
    if (step.agentEpisodes.length > 0) return step;
    const nested = findFirstEpisodeStep(step.children);
    if (nested) return nested;
  }
  return undefined;
}

/** Pick the step/episode to inspect: preferred ids, else the first conversation. */
export function resolveRunSelection(
  steps: StepNode[],
  preferred: { stepId?: string; episodeId?: string } = {},
): { stepId: string | null; episodeId: string | null } {
  if (preferred.episodeId) {
    const found = findEpisodeInTree(steps, preferred.episodeId);
    if (found) {
      return { stepId: found.step.stepId, episodeId: preferred.episodeId };
    }
  }
  if (preferred.stepId && findStepInTree(steps, preferred.stepId)) {
    return { stepId: preferred.stepId, episodeId: null };
  }
  const first = findFirstEpisodeStep(steps);
  return { stepId: first?.stepId ?? null, episodeId: null };
}

export function stepStatusClass(status: StepNodeStatus): string {
  switch (status) {
    case "running":
      return "text-[var(--lagoon-deep)]";
    case "completed":
      return "text-[var(--palm)]";
    case "failed":
      return "text-red-600 dark:text-red-400";
  }
}

export { formatMemoryScopeLabel, formatStepLabel };
