import type {
  AgentEpisode,
  InspectorRunSummary,
  RunStatus,
  RunViewState,
  StepNode,
  StepNodeStatus,
} from "@/lib/view-model/types";

export interface WaterfallScale {
  originMs: number;
  spanMs: number;
}

export interface WaterfallBar {
  leftPct: number;
  widthPct: number;
  durationMs: number;
  /** Copied/prefix layout (grafted prior timing), not this attempt's wall clock. */
  copied?: boolean;
  /**
   * Copied span laid onto the re-run's clock (prior start at or after the
   * retry anchor). Position is prior timing, not this attempt's event order.
   */
  afterAnchor?: boolean;
  /** Full prior-attempt duration for tooltips (may exceed displayed bar). */
  priorDurationMs?: number;
  /** Prior-continuation ghost past the retry anchor (straddle). */
  continuation?: {
    leftPct: number;
    widthPct: number;
    durationMs: number;
  };
  /** Prior beginning drawn before this attempt's start. Not the whole bar. */
  copiedPrefix?: {
    leftPct: number;
    widthPct: number;
    durationMs: number;
  };
}

export type TimedSpan = {
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  displayStartedAt?: string;
  displayFinishedAt?: string;
  displayDurationMs?: number;
  displayAfterAnchor?: boolean;
  priorContinuationMs?: number;
  priorDurationMs?: number;
  /** Prior beginning drawn before `startedAt` when this span covered the retry point. */
  copiedPrefixMs?: number;
  status: StepNodeStatus;
};

export type NestedRunTreeData = {
  run: InspectorRunSummary;
  view?: RunViewState;
  childRuns?: InspectorRunSummary[];
};

export type WorkflowTreeRow =
  | { kind: "step"; step: StepNode; depth: number; ownerRunId: string }
  | { kind: "episode"; step: StepNode; episode: AgentEpisode; depth: number; ownerRunId: string }
  | { kind: "nested-run"; run: InspectorRunSummary; depth: number };

export type FlattenWorkflowRowsOptions = {
  collapsedStepIds?: ReadonlySet<string>;
  /** Nested runs start collapsed; only ids in this set expand inline. */
  expandedNestedRunIds?: ReadonlySet<string>;
  depth?: number;
  ownerRunId: string;
  /** Immediate child run summaries of `ownerRunId`. */
  nestedRuns?: readonly InspectorRunSummary[];
  /** Loaded views/children for nested runs (by run id). */
  nestedByRunId?: ReadonlyMap<string, NestedRunTreeData>;
};

/** Depth-first walk used to keep tree rows and waterfall rows aligned. */
export function flattenWorkflowRows(
  steps: StepNode[],
  options: FlattenWorkflowRowsOptions,
): WorkflowTreeRow[] {
  const collapsedStepIds = options.collapsedStepIds;
  const expandedNestedRunIds = options.expandedNestedRunIds;
  const depth = options.depth ?? 0;
  const ownerRunId = options.ownerRunId;
  const nestedRuns = options.nestedRuns ?? [];
  const nestedByRunId = options.nestedByRunId;
  const out: WorkflowTreeRow[] = [];

  const rootNests = nestedRuns.filter((run) => run.parentStepId == null);
  const rootItems = interleaveByStartedAt(
    steps.map((step) => ({ kind: "step" as const, step, at: step.startedAt ?? "" })),
    rootNests.map((run) => ({ kind: "nested-run" as const, run, at: run.startedAt })),
  );

  for (const item of rootItems) {
    if (item.kind === "step") {
      appendStepRows(out, item.step, {
        collapsedStepIds,
        expandedNestedRunIds,
        depth,
        ownerRunId,
        nestedRuns,
        nestedByRunId,
      });
    } else {
      appendNestedRunRows(out, item.run, {
        collapsedStepIds,
        expandedNestedRunIds,
        depth,
        nestedByRunId,
      });
    }
  }

  return out;
}

function appendStepRows(
  out: WorkflowTreeRow[],
  step: StepNode,
  options: {
    collapsedStepIds?: ReadonlySet<string>;
    expandedNestedRunIds?: ReadonlySet<string>;
    depth: number;
    ownerRunId: string;
    nestedRuns: readonly InspectorRunSummary[];
    nestedByRunId?: ReadonlyMap<string, NestedRunTreeData>;
  },
): void {
  out.push({ kind: "step", step, depth: options.depth, ownerRunId: options.ownerRunId });
  if (options.collapsedStepIds?.has(step.stepId)) return;

  for (const episode of step.agentEpisodes) {
    out.push({
      kind: "episode",
      step,
      episode,
      depth: options.depth + 1,
      ownerRunId: options.ownerRunId,
    });
  }

  const nestsHere = options.nestedRuns.filter((run) => run.parentStepId === step.stepId);
  const childItems = interleaveByStartedAt(
    step.children.map((child) => ({
      kind: "step" as const,
      step: child,
      at: child.startedAt ?? "",
    })),
    nestsHere.map((run) => ({ kind: "nested-run" as const, run, at: run.startedAt })),
  );

  for (const item of childItems) {
    if (item.kind === "step") {
      appendStepRows(out, item.step, {
        ...options,
        depth: options.depth + 1,
      });
    } else {
      appendNestedRunRows(out, item.run, {
        collapsedStepIds: options.collapsedStepIds,
        expandedNestedRunIds: options.expandedNestedRunIds,
        depth: options.depth + 1,
        nestedByRunId: options.nestedByRunId,
      });
    }
  }
}

function appendNestedRunRows(
  out: WorkflowTreeRow[],
  run: InspectorRunSummary,
  options: {
    collapsedStepIds?: ReadonlySet<string>;
    expandedNestedRunIds?: ReadonlySet<string>;
    depth: number;
    nestedByRunId?: ReadonlyMap<string, NestedRunTreeData>;
  },
): void {
  out.push({ kind: "nested-run", run, depth: options.depth });
  if (!options.expandedNestedRunIds?.has(run.runId)) return;

  const loaded = options.nestedByRunId?.get(run.runId);
  // Still fetching this nest's events/children — NestedRunRow shows a spinner on
  // the expand control; do not insert a placeholder row (layout would flash when
  // the nest has no children).
  if (!loaded?.view) return;

  out.push(
    ...flattenWorkflowRows(loaded.view.steps, {
      collapsedStepIds: options.collapsedStepIds,
      expandedNestedRunIds: options.expandedNestedRunIds,
      depth: options.depth + 1,
      ownerRunId: run.runId,
      nestedRuns: loaded.childRuns ?? [],
      nestedByRunId: options.nestedByRunId,
    }),
  );
}

function interleaveByStartedAt<A extends { at: string }, B extends { at: string }>(
  a: A[],
  b: B[],
): Array<A | B> {
  const merged: Array<A | B> = [...a, ...b];
  merged.sort((left, right) => {
    if (left.at && right.at) return left.at.localeCompare(right.at);
    if (left.at) return -1;
    if (right.at) return 1;
    return 0;
  });
  return merged;
}

export function stepHasTreeChildren(
  step: StepNode,
  nestedUnderStep: readonly InspectorRunSummary[] = [],
): boolean {
  return step.children.length > 0 || step.agentEpisodes.length > 0 || nestedUnderStep.length > 0;
}

export function nestedRunHasExpandableChildren(data: NestedRunTreeData | undefined): boolean {
  if (!data?.view) {
    // Until loaded, assume expand may reveal content.
    return true;
  }
  return data.view.steps.length > 0 || (data.childRuns?.length ?? 0) > 0;
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
  const startMs = Date.parse(span.displayStartedAt ?? span.startedAt ?? "");
  if (!Number.isFinite(startMs)) {
    const fallbackStart = span.startedAt ? Date.parse(span.startedAt) : Number.NaN;
    if (!Number.isFinite(fallbackStart)) return null;
    return spanTimeRangeWithoutDisplay(span, nowMs, fallbackStart);
  }

  if (span.displayFinishedAt || span.displayDurationMs != null) {
    let endMs: number;
    if (span.displayFinishedAt) {
      endMs = Date.parse(span.displayFinishedAt);
    } else {
      endMs = startMs + (span.displayDurationMs ?? 0);
    }
    if (!Number.isFinite(endMs)) endMs = startMs;
    return { startMs, endMs: Math.max(endMs, startMs) };
  }

  return spanTimeRangeWithoutDisplay(span, nowMs, startMs);
}

function spanTimeRangeWithoutDisplay(
  span: TimedSpan,
  nowMs: number,
  startMs: number,
): { startMs: number; endMs: number } {
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

export function spanContinuationEndMs(span: TimedSpan, nowMs: number): number | null {
  const range = spanTimeRange(span, nowMs);
  if (!range || span.priorContinuationMs == null || span.priorContinuationMs <= 0) {
    return null;
  }
  return range.endMs + span.priorContinuationMs;
}

export function stepTimeRange(
  step: StepNode,
  nowMs: number,
): { startMs: number; endMs: number } | null {
  return spanTimeRange(step, nowMs);
}

export function runSummaryAsTimedSpan(run: InspectorRunSummary): TimedSpan {
  return {
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: runStatusAsStepStatus(run.status),
    displayStartedAt: run.displayStartedAt,
    displayFinishedAt: run.displayFinishedAt,
    displayDurationMs: run.displayDurationMs,
    displayAfterAnchor: run.displayAfterAnchor,
    priorContinuationMs: run.priorContinuationMs,
    priorDurationMs: run.priorDurationMs,
    copiedPrefixMs: run.copiedPrefixMs,
  };
}

export function runStatusAsStepStatus(status: RunStatus): StepNodeStatus {
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "completed";
}

export function computeWaterfallScale(opts: {
  runStartedAt: string;
  runFinishedAt?: string;
  runStatus: RunStatus;
  steps: StepNode[];
  nowMs: number;
  ownerRunId?: string;
  nestedRuns?: readonly InspectorRunSummary[];
  nestedByRunId?: ReadonlyMap<string, NestedRunTreeData>;
  expandedNestedRunIds?: ReadonlySet<string>;
  /** Prior beginning of the root run, drawn before `runStartedAt`. */
  runCopiedPrefixMs?: number;
}): WaterfallScale {
  const parsedOrigin = Date.parse(opts.runStartedAt);
  let originMs = Number.isFinite(parsedOrigin) ? parsedOrigin : opts.nowMs;
  if (
    opts.runCopiedPrefixMs != null &&
    opts.runCopiedPrefixMs > 0 &&
    Number.isFinite(parsedOrigin)
  ) {
    originMs = parsedOrigin - opts.runCopiedPrefixMs;
  }
  let endMs = originMs;

  if (opts.runStatus === "running") {
    endMs = Math.max(endMs, opts.nowMs);
  } else if (opts.runFinishedAt) {
    const finished = Date.parse(opts.runFinishedAt);
    if (Number.isFinite(finished)) endMs = Math.max(endMs, finished);
  }

  const rows =
    opts.ownerRunId != null
      ? flattenWorkflowRows(opts.steps, {
          ownerRunId: opts.ownerRunId,
          nestedRuns: opts.nestedRuns,
          nestedByRunId: opts.nestedByRunId,
          expandedNestedRunIds: opts.expandedNestedRunIds,
        })
      : flattenWorkflowRows(opts.steps, { ownerRunId: "" });

  for (const row of rows) {
    const span =
      row.kind === "step"
        ? row.step
        : row.kind === "episode"
          ? row.episode
          : runSummaryAsTimedSpan(row.run);
    const prefixMs =
      "copiedPrefixMs" in span && typeof span.copiedPrefixMs === "number" ? span.copiedPrefixMs : 0;
    const range = spanTimeRange(span, opts.nowMs);
    if (range) {
      originMs = Math.min(originMs, prefixMs > 0 ? range.startMs - prefixMs : range.startMs);
      endMs = Math.max(endMs, range.endMs);
    }
    const continuationEnd = spanContinuationEndMs(span, opts.nowMs);
    if (continuationEnd != null) {
      endMs = Math.max(endMs, continuationEnd);
    }
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
  let bar: WaterfallBar | null = null;
  if (range) {
    bar = computeWaterfallBar(range, scale);
  } else if (span.displayDurationMs != null) {
    bar = computeWaterfallBar(
      { startMs: scale.originMs, endMs: scale.originMs + span.displayDurationMs },
      scale,
    );
  } else if (span.durationMs != null) {
    bar = computeWaterfallBar(
      { startMs: scale.originMs, endMs: scale.originMs + span.durationMs },
      scale,
    );
  }
  if (!bar) {
    return null;
  }

  const copied =
    span.displayStartedAt != null ||
    span.displayDurationMs != null ||
    (span.priorContinuationMs != null && span.priorContinuationMs > 0);
  if (copied) {
    bar = {
      ...bar,
      copied: true,
      afterAnchor: span.displayAfterAnchor === true,
      priorDurationMs: span.priorDurationMs,
    };
  }

  const continuationEnd = spanContinuationEndMs(span, nowMs);
  if (continuationEnd != null && range) {
    const continuation = computeWaterfallBar(
      { startMs: range.endMs, endMs: continuationEnd },
      scale,
    );
    bar = { ...bar, continuation };
  }
  if (span.copiedPrefixMs != null && span.copiedPrefixMs > 0 && range && !copied) {
    bar = {
      ...bar,
      copiedPrefix: computeWaterfallBar(
        { startMs: range.startMs - span.copiedPrefixMs, endMs: range.startMs },
        scale,
      ),
    };
  }
  return bar;
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
