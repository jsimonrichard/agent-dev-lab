import type { InspectorRunSummary, RunEvent, RunViewState, StepNode } from "@/lib/view-model/types";

export type PriorStepTiming = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  path: string[];
};

export type PriorTimingIndex = {
  byStepId: Map<string, PriorStepTiming>;
  byPath: Map<string, PriorStepTiming>;
  /** Prior nested/root run wall times keyed by run id. */
  byRunId: Map<string, { startedAt: string; finishedAt: string; durationMs: number }>;
};

function pathKey(path: string[]): string {
  return path.join("\0");
}

function durationMs(startedAt: string, finishedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, end - start);
}

/** Build prior step timing from a prior attempt's UI events. */
export function buildPriorStepTimingIndex(events: readonly RunEvent[]): PriorTimingIndex {
  const byStepId = new Map<string, PriorStepTiming>();
  const byPath = new Map<string, PriorStepTiming>();
  const byRunId = new Map<string, { startedAt: string; finishedAt: string; durationMs: number }>();
  const started = new Map<string, { at: string; path: string[] }>();

  for (const event of events) {
    switch (event.type) {
      case "run_started": {
        byRunId.set(event.runId, {
          startedAt: event.at,
          finishedAt: event.at,
          durationMs: 0,
        });
        break;
      }
      case "run_finished":
      case "run_failed":
      case "run_cancelled": {
        const existing = byRunId.get(event.runId);
        if (existing) {
          byRunId.set(event.runId, {
            startedAt: existing.startedAt,
            finishedAt: event.at,
            durationMs: durationMs(existing.startedAt, event.at),
          });
        }
        break;
      }
      case "step_started": {
        started.set(event.stepId, { at: event.at, path: event.path });
        break;
      }
      case "step_finished":
      case "step_skipped": {
        const start = started.get(event.stepId);
        const startedAt = start?.at ?? event.at;
        const path = start?.path ?? ("path" in event ? event.path : []);
        const finishedAt = event.at;
        const timing: PriorStepTiming = {
          startedAt,
          finishedAt,
          durationMs:
            event.type === "step_finished"
              ? (event.durationMs ?? durationMs(startedAt, finishedAt))
              : durationMs(startedAt, finishedAt),
          path,
        };
        byStepId.set(event.stepId, timing);
        if (path.length > 0) {
          byPath.set(pathKey(path), timing);
        }
        break;
      }
      default:
        break;
    }
  }

  return { byStepId, byPath, byRunId };
}

export function mergePriorRunTiming(
  index: PriorTimingIndex,
  runId: string,
  summary: { startedAt: string; finishedAt?: string | null },
): void {
  const finishedAt = summary.finishedAt ?? summary.startedAt;
  index.byRunId.set(runId, {
    startedAt: summary.startedAt,
    finishedAt,
    durationMs: durationMs(summary.startedAt, finishedAt),
  });
}

function visitSteps(nodes: StepNode[], visit: (step: StepNode) => void): void {
  for (const node of nodes) {
    visit(node);
    visitSteps(node.children, visit);
  }
}

function findAnchorStep(steps: StepNode[]): StepNode | null {
  let found: StepNode | null = null;
  visitSteps(steps, (step) => {
    if (found) {
      return;
    }
    if (!step.copiedFromPriorAttempt && !step.replayedFromStepId && step.startedAt) {
      found = step;
    }
  });
  return found;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function applyGraftToTarget(
  target: {
    displayStartedAt?: string;
    displayFinishedAt?: string;
    displayDurationMs?: number;
    priorContinuationMs?: number;
    priorDurationMs?: number;
  },
  prior: { startedAt: string; finishedAt: string; durationMs: number },
  nAnchorMs: number,
  pAnchorMs: number,
): void {
  const pStart = Date.parse(prior.startedAt);
  const pEnd = Date.parse(prior.finishedAt);
  if (!Number.isFinite(pStart) || !Number.isFinite(pEnd)) {
    return;
  }

  // Prior entirely after anchor — no footing before retry point.
  if (pStart >= pAnchorMs) {
    return;
  }

  const displayStartMs = nAnchorMs + (pStart - pAnchorMs);
  let displayEndMs = displayStartMs + prior.durationMs;
  let priorContinuationMs = 0;

  if (pEnd > pAnchorMs) {
    // Straddle: authoritative segment ends at anchor; ghost continues past it.
    displayEndMs = nAnchorMs;
    priorContinuationMs = pEnd - pAnchorMs;
  } else {
    // Strict prefix: keep full grafted end (still ≤ N_anchor by construction).
    displayEndMs = Math.min(displayEndMs, nAnchorMs);
  }

  if (displayStartMs >= displayEndMs && priorContinuationMs <= 0) {
    return;
  }

  target.displayStartedAt = toIso(displayStartMs);
  target.displayFinishedAt = toIso(Math.max(displayEndMs, displayStartMs));
  target.displayDurationMs = Math.max(0, displayEndMs - displayStartMs);
  target.priorDurationMs = prior.durationMs;
  if (priorContinuationMs > 0) {
    target.priorContinuationMs = priorContinuationMs;
  }
}

/**
 * Layout-only: graft prior-attempt timings onto copied steps/nests for the waterfall.
 * Mutates `view.steps` and optional `nestedRuns` in place.
 */
export function graftCopiedWaterfallTiming(
  view: RunViewState,
  prior: PriorTimingIndex,
  nestedRuns: InspectorRunSummary[] = [],
): void {
  const anchor = findAnchorStep(view.steps);
  if (!anchor?.startedAt) {
    return;
  }
  const nAnchorMs = Date.parse(anchor.startedAt);
  if (!Number.isFinite(nAnchorMs)) {
    return;
  }

  const priorAnchor =
    prior.byPath.get(pathKey(anchor.path)) ??
    // Fallback: earliest prior step that shares the leaf path segment name.
    [...prior.byPath.values()].find(
      (timing) => timing.path[timing.path.length - 1] === anchor.path[anchor.path.length - 1],
    );
  if (!priorAnchor) {
    return;
  }
  const pAnchorMs = Date.parse(priorAnchor.startedAt);
  if (!Number.isFinite(pAnchorMs)) {
    return;
  }

  visitSteps(view.steps, (step) => {
    if (!step.copiedFromPriorAttempt && !step.replayedFromStepId) {
      return;
    }
    const timing =
      (step.replayedFromStepId ? prior.byStepId.get(step.replayedFromStepId) : undefined) ??
      prior.byPath.get(pathKey(step.path));
    if (!timing) {
      return;
    }
    applyGraftToTarget(step, timing, nAnchorMs, pAnchorMs);
  });

  for (const run of nestedRuns) {
    if (!run.replayOfRunId) {
      continue;
    }
    const timing = prior.byRunId.get(run.replayOfRunId);
    if (!timing) {
      continue;
    }
    applyGraftToTarget(run, timing, nAnchorMs, pAnchorMs);
  }
}
