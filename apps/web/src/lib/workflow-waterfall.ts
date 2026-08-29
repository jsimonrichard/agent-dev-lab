import type { AgentEpisode, RunStatus, StepNode, StepNodeStatus } from "@/lib/view-model/types";

export interface WaterfallScale {
  originMs: number;
  spanMs: number;
}

export interface WaterfallBar {
  leftPct: number;
  widthPct: number;
  durationMs: number;
}

export type TimedSpan = {
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  status: StepNodeStatus;
};

export type WorkflowTreeRow =
  | { kind: "step"; step: StepNode; depth: number }
  | { kind: "episode"; step: StepNode; episode: AgentEpisode; depth: number };

/** Depth-first walk used to keep tree rows and waterfall rows aligned. */
export function flattenWorkflowRows(
  steps: StepNode[],
  options: { collapsedStepIds?: ReadonlySet<string>; depth?: number } = {},
): WorkflowTreeRow[] {
  const collapsedStepIds = options.collapsedStepIds;
  const depth = options.depth ?? 0;
  const out: WorkflowTreeRow[] = [];
  for (const step of steps) {
    out.push({ kind: "step", step, depth });
    if (collapsedStepIds?.has(step.stepId)) continue;
    for (const episode of step.agentEpisodes) {
      out.push({ kind: "episode", step, episode, depth: depth + 1 });
    }
    out.push(
      ...flattenWorkflowRows(step.children, {
        collapsedStepIds,
        depth: depth + 1,
      }),
    );
  }
  return out;
}

export function stepHasTreeChildren(step: StepNode): boolean {
  return step.children.length > 0 || step.agentEpisodes.length > 0;
}

export function formatDuration(durationMs: number): string {
  const abs = Math.max(0, durationMs);
  if (abs < 1000) return `${Math.round(abs)}ms`;
  if (abs < 60_000) return `${(abs / 1000).toFixed(abs < 10_000 ? 1 : 0)}s`;
  const minutes = abs / 60_000;
  return `${minutes.toFixed(minutes < 10 ? 1 : 0)}m`;
}

export function spanTimeRange(
  span: TimedSpan,
  nowMs: number,
): { startMs: number; endMs: number } | null {
  const startMs = span.startedAt ? Date.parse(span.startedAt) : Number.NaN;
  if (!Number.isFinite(startMs)) return null;

  let endMs: number;
  if (span.status === "running") {
    endMs = Math.max(nowMs, startMs);
  } else if (span.finishedAt) {
    endMs = Date.parse(span.finishedAt);
  } else if (span.durationMs != null) {
    endMs = startMs + span.durationMs;
  } else {
    endMs = startMs;
  }

  if (!Number.isFinite(endMs)) endMs = startMs;
  return { startMs, endMs: Math.max(endMs, startMs) };
}

export function stepTimeRange(
  step: StepNode,
  nowMs: number,
): { startMs: number; endMs: number } | null {
  return spanTimeRange(step, nowMs);
}

export function computeWaterfallScale(opts: {
  runStartedAt: string;
  runFinishedAt?: string;
  runStatus: RunStatus;
  steps: StepNode[];
  nowMs: number;
}): WaterfallScale {
  const parsedOrigin = Date.parse(opts.runStartedAt);
  const originMs = Number.isFinite(parsedOrigin) ? parsedOrigin : opts.nowMs;
  let endMs = originMs;

  if (opts.runStatus === "running") {
    endMs = Math.max(endMs, opts.nowMs);
  } else if (opts.runFinishedAt) {
    const finished = Date.parse(opts.runFinishedAt);
    if (Number.isFinite(finished)) endMs = Math.max(endMs, finished);
  }

  for (const row of flattenWorkflowRows(opts.steps)) {
    const span = row.kind === "step" ? row.step : row.episode;
    const range = spanTimeRange(span, opts.nowMs);
    if (range) endMs = Math.max(endMs, range.endMs);
  }

  return { originMs, spanMs: Math.max(1, endMs - originMs) };
}

export function computeWaterfallBar(
  range: { startMs: number; endMs: number },
  scale: WaterfallScale,
): WaterfallBar {
  const durationMs = Math.max(0, range.endMs - range.startMs);
  const leftPct = clamp(((range.startMs - scale.originMs) / scale.spanMs) * 100, 0, 100);
  const rawWidthPct = (durationMs / scale.spanMs) * 100;
  const minWidthPct = durationMs === 0 ? 0.4 : rawWidthPct;
  return {
    leftPct,
    widthPct: clamp(Math.max(rawWidthPct, minWidthPct), 0, 100 - leftPct),
    durationMs,
  };
}

export function computeSpanWaterfallBar(
  span: TimedSpan,
  scale: WaterfallScale,
  nowMs: number,
): WaterfallBar | null {
  const range = spanTimeRange(span, nowMs);
  if (range) return computeWaterfallBar(range, scale);
  if (span.durationMs == null) return null;
  return computeWaterfallBar(
    { startMs: scale.originMs, endMs: scale.originMs + span.durationMs },
    scale,
  );
}

export function computeStepWaterfallBar(
  step: StepNode,
  scale: WaterfallScale,
  nowMs: number,
): WaterfallBar | null {
  return computeSpanWaterfallBar(step, scale, nowMs);
}

/** More time labels as the timeline is stretched. Zoom 1 → 5 ticks, zoom 16 → 17. */
export function waterfallTickCount(zoom: number): number {
  return Math.min(17, 4 + Math.round(Math.min(16, Math.max(1, zoom))));
}

export function waterfallTickMarks(
  scale: WaterfallScale,
  tickCount = 5,
): { pct: number; label: string }[] {
  const last = Math.max(2, tickCount) - 1;
  return Array.from({ length: last + 1 }, (_, i) => {
    const fraction = i / last;
    return { pct: fraction * 100, label: formatDuration(scale.spanMs * fraction) };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
