import { forwardRef, memo, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  SquareArrowOutUpRight,
} from "lucide-react";

import { ErrorIndicator } from "@/components/app/error-details";
import { formatMemoryScopeLabel, formatStepLabel } from "@/lib/view-model/run-projection";
import type {
  AgentEpisode,
  InspectorRunSummary,
  RunViewState,
  StepNode,
  StepNodeStatus,
} from "@/lib/view-model/types";
import { workflowRunLabel, workflowRunSearch } from "@/lib/workflow/workflow-location";
import {
  computeSpanWaterfallBar,
  formatDuration,
  runStatusAsStepStatus,
  runSummaryAsTimedSpan,
  stepHasTreeChildren,
  type WaterfallBar,
  type WaterfallScale,
} from "@/lib/workflow/workflow-waterfall";
import { cn } from "@/lib/utils";
import { useInspectorConnection } from "#/lib/inspector-connection";

import {
  ROW_DIVIDER,
  WORKFLOW_ROW_ID,
  rowToneClass,
  treeControlFocusClass,
  waterfallToneClass,
} from "./constants";
import {
  episodeRowLooksSame,
  nestedRunRowLooksSame,
  stepRowLooksSame,
  workflowRowLooksSame,
} from "./row-looks-same";
import { WaterfallTrack, type WaterfallKind } from "./waterfall";

function runStatusAsStep(status: RunViewState["status"]): StepNodeStatus {
  return runStatusAsStepStatus(status);
}

export const WorkflowRow = memo(function WorkflowRow({
  pane,
  workflowId,
  status,
  selected,
  collapsed,
  hiddenCount,
  bar,
  onToggleCollapsed,
  onSelect,
}: {
  pane: "tree" | "waterfall";
  workflowId: string;
  status: RunViewState["status"];
  selected: boolean;
  collapsed: boolean;
  hiddenCount: number;
  bar: WaterfallBar | null;
  onToggleCollapsed: () => void;
  onSelect: () => void;
}) {
  const stepStatus = runStatusAsStep(status);
  return (
    <GridRow
      pane={pane}
      rowId={WORKFLOW_ROW_ID}
      selected={selected}
      onSelect={onSelect}
      ariaLabel={`${workflowId} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
      bar={bar}
      status={stepStatus}
      label={workflowId}
      barSize="workflow"
      leading={
        <CollapseToggle
          expanded={!collapsed}
          disabled={hiddenCount === 0}
          label={workflowId}
          onToggle={onToggleCollapsed}
        />
      }
      trailing={<RowStatusIcon status={stepStatus} kind="step" />}
      depth={0}
    >
      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono font-medium">{workflowId}</span>
      {collapsed && hiddenCount > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{hiddenCount}</span>
      ) : null}
    </GridRow>
  );
}, workflowRowLooksSame);

/** Shorter than the shared tip max so this sentence wraps instead of stretching. */
const COPIED_TIP_MAX = "13rem";

function CopiedFromPriorBadge({
  title,
  onOpen,
  href,
}: {
  title: string;
  onOpen?: () => void;
  href?: { workflowId: string; runId: string; stepId?: string };
}) {
  const icon = (
    <SquareArrowOutUpRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
  );
  const body = (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-sky-500/40 bg-sky-500/10 px-1 py-px text-[9px] font-semibold tracking-wide text-sky-800 uppercase dark:text-sky-200">
      {icon}
      Copied
    </span>
  );
  if (href) {
    return (
      <Link
        to="/workflows/$workflowId/run/$runId"
        params={{ workflowId: href.workflowId, runId: href.runId }}
        search={href.stepId ? workflowRunSearch({ step: href.stepId }) : undefined}
        data-tip={title}
        data-tip-max={COPIED_TIP_MAX}
        className="shrink-0 hover:opacity-80"
        onClick={(event) => event.stopPropagation()}
      >
        {body}
      </Link>
    );
  }
  if (onOpen) {
    return (
      <button
        type="button"
        data-tip={title}
        data-tip-max={COPIED_TIP_MAX}
        className="shrink-0 hover:opacity-80"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {body}
      </button>
    );
  }
  return (
    <span className="shrink-0" data-tip={title} data-tip-max={COPIED_TIP_MAX}>
      {body}
    </span>
  );
}

type SlotDomProps = Omit<HTMLAttributes<HTMLElement>, "children" | "onSelect" | "color">;

export const StepRow = memo(
  forwardRef<
    HTMLElement,
    {
      pane: "tree" | "waterfall";
      step: StepNode;
      ownerRunId: string;
      depth: number;
      nestedUnderStep: readonly InspectorRunSummary[];
      scale: WaterfallScale;
      nowMs: number;
      collapsed: boolean;
      selected: boolean;
      onToggleCollapsed: (stepId: string) => void;
      onSelectStep: (stepId: string, ownerRunId: string) => void;
      priorAttemptRunId?: string | null;
      priorAttemptWorkflowId?: string;
    } & SlotDomProps
  >(function StepRow(
    {
      pane,
      step,
      ownerRunId,
      depth,
      nestedUnderStep,
      scale,
      nowMs,
      collapsed,
      selected,
      onToggleCollapsed,
      onSelectStep,
      priorAttemptRunId,
      priorAttemptWorkflowId,
      ...slotProps
    },
    ref,
  ) {
    const label = formatStepLabel(step.name, step.key);
    const hasChildren = stepHasTreeChildren(step, nestedUnderStep);
    const hiddenCount = step.children.length + step.agentEpisodes.length + nestedUnderStep.length;
    const bar = computeSpanWaterfallBar(step, scale, nowMs);

    return (
      <GridRow
        ref={ref}
        pane={pane}
        rowId={step.stepId}
        selected={selected}
        onSelect={() => onSelectStep(step.stepId, ownerRunId)}
        ariaLabel={`${label} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
        bar={bar}
        status={step.status}
        label={label}
        barSize="step"
        leading={
          <CollapseToggle
            expanded={!collapsed}
            disabled={!hasChildren}
            label={label}
            onToggle={() => onToggleCollapsed(step.stepId)}
          />
        }
        trailing={<RowStatusIcon status={step.status} kind="step" />}
        depth={depth}
        {...slotProps}
      >
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono font-medium">{label}</span>
        {step.copiedFromPriorAttempt || step.replayedFromStepId ? (
          <CopiedFromPriorBadge
            title={
              priorAttemptRunId
                ? "Step result copied from the prior attempt — open original"
                : "Step result copied from a prior attempt"
            }
            href={
              priorAttemptRunId && priorAttemptWorkflowId
                ? step.replayedFromStepId
                  ? {
                      workflowId: priorAttemptWorkflowId,
                      runId: priorAttemptRunId,
                      stepId: step.replayedFromStepId,
                    }
                  : { workflowId: priorAttemptWorkflowId, runId: priorAttemptRunId }
                : undefined
            }
          />
        ) : null}
        {collapsed && hiddenCount > 0 ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">{hiddenCount}</span>
        ) : null}
        {step.status === "failed" && step.error ? (
          <ErrorIndicator error={step.error} className="min-w-0 text-[10px]" />
        ) : null}
      </GridRow>
    );
  }),
  stepRowLooksSame,
);

export const NestedRunRow = memo(
  forwardRef<
    HTMLElement,
    {
      pane: "tree" | "waterfall";
      run: InspectorRunSummary;
      depth: number;
      scale: WaterfallScale;
      nowMs: number;
      expanded: boolean;
      expandable: boolean;
      loading: boolean;
      selected: boolean;
      onToggleExpanded: (runId: string) => void;
      onSelectNestedRun: (runId: string) => void;
      copiedFromPriorAttempt?: boolean;
      onOpenNestedRunPage?: (run: InspectorRunSummary) => void;
    } & SlotDomProps
  >(function NestedRunRow(
    {
      pane,
      run,
      depth,
      scale,
      nowMs,
      expanded,
      expandable,
      loading,
      selected,
      onToggleExpanded,
      onSelectNestedRun,
      copiedFromPriorAttempt,
      onOpenNestedRunPage,
      ...slotProps
    },
    ref,
  ) {
    const label = workflowRunLabel({ runId: run.runId, title: run.title }) || run.workflowId;
    const status = runStatusAsStepStatus(run.status);
    const bar = computeSpanWaterfallBar(runSummaryAsTimedSpan(run), scale, nowMs);

    return (
      <GridRow
        ref={ref}
        pane={pane}
        rowId={run.runId}
        selected={selected}
        onSelect={() => onSelectNestedRun(run.runId)}
        ariaLabel={`${run.workflowId} nested run duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
        bar={bar}
        status={status}
        label={label}
        barSize="workflow"
        leading={
          <CollapseToggle
            expanded={expanded}
            disabled={!expandable}
            loading={loading}
            label={run.workflowId}
            onToggle={() => onToggleExpanded(run.runId)}
          />
        }
        trailing={<RowStatusIcon status={status} kind="step" />}
        depth={depth}
        {...slotProps}
      >
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono font-medium">{run.workflowId}</span>
        {copiedFromPriorAttempt ? (
          <CopiedFromPriorBadge
            title="Sub-workflow copied from the prior attempt — open original run"
            onOpen={
              run.replayOfRunId && onOpenNestedRunPage
                ? () =>
                    onOpenNestedRunPage({
                      ...run,
                      runId: run.replayOfRunId!,
                    })
                : undefined
            }
          />
        ) : null}
        {run.title?.trim() ? (
          <span className="truncate text-[10px] text-muted-foreground">{run.title.trim()}</span>
        ) : null}
      </GridRow>
    );
  }),
  nestedRunRowLooksSame,
);

export const EpisodeRow = memo(function EpisodeRow({
  pane,
  episode,
  stepId,
  depth,
  runId,
  scale,
  nowMs,
  selected,
  onSelectEpisode,
}: {
  pane: "tree" | "waterfall";
  episode: AgentEpisode;
  stepId: string;
  depth: number;
  runId: string;
  scale: WaterfallScale;
  nowMs: number;
  selected: boolean;
  onSelectEpisode: (stepId: string, episode: AgentEpisode, ownerRunId: string) => void;
}) {
  const scopeLabel = formatMemoryScopeLabel(episode.memoryScope, runId);
  const label = `${scopeLabel} · ${episode.agentId}`;
  const bar = computeSpanWaterfallBar(episode, scale, nowMs);

  return (
    <GridRow
      pane={pane}
      rowId={episode.episodeId}
      selected={selected}
      onSelect={() => onSelectEpisode(stepId, episode, runId)}
      ariaLabel={`${label} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
      bar={bar}
      status={episode.status}
      label={label}
      barSize="agent"
      leading={<span className="size-3.5 shrink-0" aria-hidden />}
      trailing={<RowStatusIcon status={episode.status} kind="conversation" />}
      depth={depth}
    >
      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono font-medium" title={episode.memoryScope}>
        {scopeLabel}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">{episode.agentId}</span>
      {episode.warnings.length > 0 ? (
        <span
          className="size-2 shrink-0 rounded-full bg-amber-500"
          aria-label="Conversation has warnings"
          title={episode.warnings[0]}
        />
      ) : null}
      {episode.status === "failed" && episode.error ? (
        <ErrorIndicator error={episode.error} className="min-w-0 text-[10px]" />
      ) : null}
    </GridRow>
  );
}, episodeRowLooksSame);

const GridRow = forwardRef<
  HTMLElement,
  {
    pane: "tree" | "waterfall";
    rowId: string;
    selected: boolean;
    onSelect: () => void;
    ariaLabel: string;
    bar: WaterfallBar | null;
    status: StepNodeStatus;
    label: string;
    barSize: WaterfallKind;
    leading: ReactNode;
    trailing?: ReactNode;
    depth: number;
    children: ReactNode;
  } & SlotDomProps
>(function GridRow(
  {
    pane,
    rowId,
    selected,
    onSelect,
    ariaLabel,
    bar,
    status,
    label,
    barSize,
    leading,
    trailing,
    depth,
    children,
    className,
    onClick,
    style,
    ...slotProps
  },
  ref,
) {
  const tone = rowToneClass(selected);
  if (pane === "waterfall") {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        tabIndex={-1}
        data-row-id={rowId}
        aria-hidden
        className={cn("group relative h-9 w-full shrink-0 px-3", ROW_DIVIDER, className)}
        style={style}
        {...slotProps}
        onClick={(event) => {
          onClick?.(event);
          onSelect();
        }}
      >
        <div aria-hidden className={cn("absolute inset-0 z-0", waterfallToneClass(selected))} />
        <div className="relative z-[2]">
          <WaterfallTrack bar={bar} status={status} label={label} kind={barSize} />
        </div>
      </button>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      data-row-id={rowId}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 overflow-hidden border-l-2 py-1 pr-2",
        ROW_DIVIDER,
        tone,
        selected ? "border-l-primary" : "border-l-transparent",
        className,
      )}
      style={{ paddingLeft: 8 + depth * 16, ...style }}
      {...slotProps}
    >
      {leading}
      <button
        type="button"
        onClick={onSelect}
        aria-label={ariaLabel}
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-xs",
          treeControlFocusClass,
        )}
      >
        {children}
      </button>
      {trailing}
    </div>
  );
});

function CollapseToggle({
  expanded,
  disabled,
  loading = false,
  label,
  onToggle,
}: {
  expanded: boolean;
  disabled: boolean;
  loading?: boolean;
  label: string;
  onToggle: () => void;
}) {
  if (loading) {
    return (
      <button
        type="button"
        aria-busy="true"
        aria-expanded={expanded}
        aria-label={`Loading ${label}`}
        onClick={onToggle}
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
          treeControlFocusClass,
        )}
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      </button>
    );
  }
  if (disabled) {
    return <span className="size-3.5 shrink-0" aria-hidden />;
  }
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      onClick={onToggle}
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
        treeControlFocusClass,
      )}
    >
      <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
    </button>
  );
}

function RowStatusIcon({
  status,
  kind,
}: {
  status: StepNodeStatus;
  kind: "step" | "conversation";
}) {
  const { offline } = useInspectorConnection();
  if (status === "completed") return null;
  if (status === "running") {
    return (
      <Loader2
        className={cn(
          "size-3.5 shrink-0 text-primary",
          !offline && "animate-spin",
          offline && "opacity-50",
        )}
        aria-label={
          offline
            ? kind === "step"
              ? "Step interrupted"
              : "Conversation interrupted"
            : kind === "step"
              ? "Step running"
              : "Conversation running"
        }
      />
    );
  }
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-destructive"
      aria-label={kind === "step" ? "Step failed" : "Conversation failed"}
    />
  );
}
