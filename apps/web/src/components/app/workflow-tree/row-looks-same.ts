import type {
  AgentEpisode,
  InspectorRunSummary,
  RunViewState,
  StepNode,
} from "@/lib/view-model/types";
import {
  runStatusAsStepStatus,
  type WaterfallBar,
  type WaterfallScale,
} from "@/lib/workflow/workflow-waterfall";

function spanLooksSame(
  a: {
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    displayStartedAt?: string;
    displayFinishedAt?: string;
    displayDurationMs?: number;
    displayAfterAnchor?: boolean;
    priorContinuationMs?: number;
    priorDurationMs?: number;
    copiedPrefixMs?: number;
  },
  b: {
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    displayStartedAt?: string;
    displayFinishedAt?: string;
    displayDurationMs?: number;
    displayAfterAnchor?: boolean;
    priorContinuationMs?: number;
    priorDurationMs?: number;
    copiedPrefixMs?: number;
  },
): boolean {
  return (
    a.startedAt === b.startedAt &&
    a.finishedAt === b.finishedAt &&
    a.durationMs === b.durationMs &&
    a.displayStartedAt === b.displayStartedAt &&
    a.displayFinishedAt === b.displayFinishedAt &&
    a.displayDurationMs === b.displayDurationMs &&
    a.displayAfterAnchor === b.displayAfterAnchor &&
    a.priorContinuationMs === b.priorContinuationMs &&
    a.priorDurationMs === b.priorDurationMs &&
    a.copiedPrefixMs === b.copiedPrefixMs
  );
}

function scaleLooksSame(a: WaterfallScale, b: WaterfallScale): boolean {
  return a.originMs === b.originMs && a.spanMs === b.spanMs;
}

function errorLooksSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function barLooksSame(a: WaterfallBar | null, b: WaterfallBar | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.leftPct === b.leftPct &&
    a.widthPct === b.widthPct &&
    a.durationMs === b.durationMs &&
    a.copied === b.copied &&
    a.afterAnchor === b.afterAnchor &&
    a.priorDurationMs === b.priorDurationMs &&
    a.continuation?.leftPct === b.continuation?.leftPct &&
    a.continuation?.widthPct === b.continuation?.widthPct &&
    a.continuation?.durationMs === b.continuation?.durationMs &&
    a.copiedPrefix?.leftPct === b.copiedPrefix?.leftPct &&
    a.copiedPrefix?.widthPct === b.copiedPrefix?.widthPct &&
    a.copiedPrefix?.durationMs === b.copiedPrefix?.durationMs
  );
}

function clockStillMatches(status: string, prevNow: number, nextNow: number): boolean {
  return status !== "running" || prevNow === nextNow;
}

export function workflowRowLooksSame(
  prev: {
    pane: "tree" | "waterfall";
    workflowId: string;
    status: RunViewState["status"];
    selected: boolean;
    collapsed: boolean;
    hiddenCount: number;
    bar: WaterfallBar | null;
  },
  next: {
    pane: "tree" | "waterfall";
    workflowId: string;
    status: RunViewState["status"];
    selected: boolean;
    collapsed: boolean;
    hiddenCount: number;
    bar: WaterfallBar | null;
  },
): boolean {
  return (
    prev.pane === next.pane &&
    prev.workflowId === next.workflowId &&
    prev.status === next.status &&
    prev.selected === next.selected &&
    prev.collapsed === next.collapsed &&
    prev.hiddenCount === next.hiddenCount &&
    barLooksSame(prev.bar, next.bar)
  );
}

export function stepRowLooksSame(
  prev: {
    pane: "tree" | "waterfall";
    step: StepNode;
    ownerRunId: string;
    depth: number;
    nestedUnderStep: readonly InspectorRunSummary[];
    scale: WaterfallScale;
    nowMs: number;
    collapsed: boolean;
    selected: boolean;
    priorAttemptRunId?: string | null;
    priorAttemptWorkflowId?: string;
  },
  next: {
    pane: "tree" | "waterfall";
    step: StepNode;
    ownerRunId: string;
    depth: number;
    nestedUnderStep: readonly InspectorRunSummary[];
    scale: WaterfallScale;
    nowMs: number;
    collapsed: boolean;
    selected: boolean;
    priorAttemptRunId?: string | null;
    priorAttemptWorkflowId?: string;
  },
): boolean {
  const a = prev.step;
  const b = next.step;
  if (
    prev.pane !== next.pane ||
    prev.ownerRunId !== next.ownerRunId ||
    prev.depth !== next.depth ||
    prev.collapsed !== next.collapsed ||
    prev.selected !== next.selected ||
    prev.priorAttemptRunId !== next.priorAttemptRunId ||
    prev.priorAttemptWorkflowId !== next.priorAttemptWorkflowId
  ) {
    return false;
  }
  if (!scaleLooksSame(prev.scale, next.scale)) return false;
  if (
    a.stepId !== b.stepId ||
    a.name !== b.name ||
    a.key !== b.key ||
    a.status !== b.status ||
    a.copiedFromPriorAttempt !== b.copiedFromPriorAttempt ||
    a.replayedFromStepId !== b.replayedFromStepId ||
    a.children.length !== b.children.length ||
    a.agentEpisodes.length !== b.agentEpisodes.length ||
    prev.nestedUnderStep.length !== next.nestedUnderStep.length
  ) {
    return false;
  }
  if (!spanLooksSame(a, b)) return false;
  if (!clockStillMatches(a.status, prev.nowMs, next.nowMs)) return false;
  if (a.status === "failed" && !errorLooksSame(a.error, b.error)) return false;
  return true;
}

export function nestedRunRowLooksSame(
  prev: {
    pane: "tree" | "waterfall";
    run: InspectorRunSummary;
    depth: number;
    scale: WaterfallScale;
    nowMs: number;
    expanded: boolean;
    expandable: boolean;
    loading: boolean;
    selected: boolean;
    copiedFromPriorAttempt?: boolean;
  },
  next: {
    pane: "tree" | "waterfall";
    run: InspectorRunSummary;
    depth: number;
    scale: WaterfallScale;
    nowMs: number;
    expanded: boolean;
    expandable: boolean;
    loading: boolean;
    selected: boolean;
    copiedFromPriorAttempt?: boolean;
  },
): boolean {
  const a = prev.run;
  const b = next.run;
  if (
    prev.pane !== next.pane ||
    prev.depth !== next.depth ||
    prev.expanded !== next.expanded ||
    prev.expandable !== next.expandable ||
    prev.loading !== next.loading ||
    prev.selected !== next.selected ||
    prev.copiedFromPriorAttempt !== next.copiedFromPriorAttempt
  ) {
    return false;
  }
  if (!scaleLooksSame(prev.scale, next.scale)) return false;
  if (
    a.runId !== b.runId ||
    a.workflowId !== b.workflowId ||
    a.title !== b.title ||
    a.status !== b.status ||
    a.replayOfRunId !== b.replayOfRunId
  ) {
    return false;
  }
  if (!spanLooksSame(a, b)) return false;
  return clockStillMatches(runStatusAsStepStatus(a.status), prev.nowMs, next.nowMs);
}

export function episodeRowLooksSame(
  prev: {
    pane: "tree" | "waterfall";
    episode: AgentEpisode;
    stepId: string;
    depth: number;
    runId: string;
    scale: WaterfallScale;
    nowMs: number;
    selected: boolean;
  },
  next: {
    pane: "tree" | "waterfall";
    episode: AgentEpisode;
    stepId: string;
    depth: number;
    runId: string;
    scale: WaterfallScale;
    nowMs: number;
    selected: boolean;
  },
): boolean {
  const a = prev.episode;
  const b = next.episode;
  if (
    prev.pane !== next.pane ||
    prev.stepId !== next.stepId ||
    prev.depth !== next.depth ||
    prev.runId !== next.runId ||
    prev.selected !== next.selected
  ) {
    return false;
  }
  if (!scaleLooksSame(prev.scale, next.scale)) return false;
  if (
    a.episodeId !== b.episodeId ||
    a.agentId !== b.agentId ||
    a.memoryScope !== b.memoryScope ||
    a.status !== b.status ||
    a.warnings.length !== b.warnings.length ||
    a.warnings[0] !== b.warnings[0]
  ) {
    return false;
  }
  if (!spanLooksSame(a, b)) return false;
  if (!clockStillMatches(a.status, prev.nowMs, next.nowMs)) return false;
  if (a.status === "failed" && !errorLooksSame(a.error, b.error)) return false;
  return true;
}
