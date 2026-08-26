import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRight, GitBranch, Layers, Loader2, MessageSquare } from "lucide-react";

import { ErrorDetails, ErrorIndicator } from "@/components/app/error-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMemoryScopeLabel, formatStepLabel } from "@/lib/mock/run-projection";
import type { AgentEpisode, RunViewState, StepNode, StepNodeStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import {
  computeSpanWaterfallBar,
  computeWaterfallScale,
  flattenWorkflowRows,
  formatDuration,
  stepHasTreeChildren,
  waterfallTickCount,
  waterfallTickMarks,
  type WaterfallBar,
} from "@/lib/workflow-waterfall";

const WORKFLOW_ROW_ID = "__workflow__";
const ROW_DIVIDER = "border-b border-border/40";
const PANE_SPLIT = "border-r border-border";

interface WorkflowTreePanelProps {
  view: RunViewState;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  workflowSelected: boolean;
  onSelectWorkflow: () => void;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (stepId: string, episode: AgentEpisode) => void;
}

export function WorkflowTreePanel({
  view,
  selectedStepId,
  selectedEpisodeId,
  workflowSelected,
  onSelectWorkflow,
  onSelectStep,
  onSelectEpisode,
}: WorkflowTreePanelProps) {
  const live = view.status === "running";
  const nowMs = useLiveNow(live);
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const scale = useMemo(
    () =>
      computeWaterfallScale({
        runStartedAt: view.startedAt,
        runFinishedAt: view.finishedAt,
        runStatus: view.status,
        steps: view.steps,
        nowMs,
      }),
    [view.startedAt, view.finishedAt, view.status, view.steps, nowMs],
  );
  const ticks = waterfallTickMarks(scale, waterfallTickCount(zoom));
  const workflowCollapsed = collapsedStepIds.has(WORKFLOW_ROW_ID);
  const rows = useMemo(
    () =>
      workflowCollapsed ? [] : flattenWorkflowRows(view.steps, { collapsedStepIds, depth: 1 }),
    [view.steps, collapsedStepIds, workflowCollapsed],
  );
  const workflowBar = computeSpanWaterfallBar(
    {
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
      status: runStatusAsStep(view.status),
    },
    scale,
    nowMs,
  );

  const toggleCollapsed = useCallback((stepId: string) => {
    setCollapsedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const split = useColumnSplit();
  const showSplit = view.steps.length > 0 || view.status === "running";
  const empty = view.steps.length === 0;
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const waterfallScrollRef = useRef<HTMLDivElement>(null);
  const scrollbarGutter = useScrollbarGutter(waterfallScrollRef, zoom, rows.length);
  const waterfallPaneWidth = useWaterfallPaneWidth(waterfallScrollRef, zoom, !empty);
  useSyncedVerticalScroll(treeScrollRef, waterfallScrollRef, !empty);
  useWaterfallZoom(waterfallScrollRef, zoom, setZoom, !empty);

  return (
    <div
      ref={split.containerRef}
      className={cn(
        "relative flex h-full min-h-0 bg-background",
        split.dragging && "cursor-col-resize select-none",
      )}
      onMouseLeave={() => setHoveredRowId(null)}
    >
      {empty ? (
        <EmptyRunState status={view.status} error={view.error} />
      ) : (
        <TooltipProvider delayDuration={200}>
          <div
            ref={treeScrollRef}
            className="h-full min-h-0 shrink-0 overflow-x-hidden overflow-y-auto scrollbar-none"
            style={{ width: split.treeWidth ?? "40%" }}
          >
            <div className="flex min-h-full flex-col" style={{ paddingBottom: scrollbarGutter }}>
              <StepsHeader />
              <WorkflowRow
                pane="tree"
                workflowId={view.workflowId}
                status={view.status}
                selected={workflowSelected}
                hovered={hoveredRowId === WORKFLOW_ROW_ID}
                collapsed={workflowCollapsed}
                hiddenCount={view.steps.length}
                bar={workflowBar}
                ticks={ticks}
                onHover={() => setHoveredRowId(WORKFLOW_ROW_ID)}
                onToggleCollapsed={() => toggleCollapsed(WORKFLOW_ROW_ID)}
                onSelect={onSelectWorkflow}
              />
              {rows.map((row) =>
                row.kind === "step" ? (
                  <StepRow
                    key={row.step.stepId}
                    pane="tree"
                    step={row.step}
                    depth={row.depth}
                    bar={computeSpanWaterfallBar(row.step, scale, nowMs)}
                    ticks={ticks}
                    collapsed={collapsedStepIds.has(row.step.stepId)}
                    selected={selectedStepId === row.step.stepId && selectedEpisodeId === null}
                    hovered={hoveredRowId === row.step.stepId}
                    onHover={() => setHoveredRowId(row.step.stepId)}
                    onToggleCollapsed={() => toggleCollapsed(row.step.stepId)}
                    onSelect={() => onSelectStep(row.step.stepId)}
                  />
                ) : (
                  <EpisodeRow
                    key={row.episode.episodeId}
                    pane="tree"
                    episode={row.episode}
                    depth={row.depth}
                    runId={view.runId}
                    bar={computeSpanWaterfallBar(row.episode, scale, nowMs)}
                    ticks={ticks}
                    selected={selectedEpisodeId === row.episode.episodeId}
                    hovered={hoveredRowId === row.episode.episodeId}
                    onHover={() => setHoveredRowId(row.episode.episodeId)}
                    onSelect={() => onSelectEpisode(row.step.stepId, row.episode)}
                  />
                ),
              )}
              <div className="min-h-0 flex-1" />
            </div>
          </div>
          <div
            ref={waterfallScrollRef}
            className="h-full min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain"
          >
            <div
              className="relative flex min-h-full flex-col"
              style={{
                width:
                  waterfallPaneWidth > 0
                    ? waterfallPaneWidth * zoom
                    : `${Math.max(zoom, 1) * 100}%`,
              }}
            >
              <WaterfallHeader ticks={ticks} />
              <WorkflowRow
                pane="waterfall"
                workflowId={view.workflowId}
                status={view.status}
                selected={workflowSelected}
                hovered={hoveredRowId === WORKFLOW_ROW_ID}
                collapsed={workflowCollapsed}
                hiddenCount={view.steps.length}
                bar={workflowBar}
                ticks={ticks}
                onHover={() => setHoveredRowId(WORKFLOW_ROW_ID)}
                onToggleCollapsed={() => toggleCollapsed(WORKFLOW_ROW_ID)}
                onSelect={onSelectWorkflow}
              />
              {rows.map((row) =>
                row.kind === "step" ? (
                  <StepRow
                    key={row.step.stepId}
                    pane="waterfall"
                    step={row.step}
                    depth={row.depth}
                    bar={computeSpanWaterfallBar(row.step, scale, nowMs)}
                    ticks={ticks}
                    collapsed={collapsedStepIds.has(row.step.stepId)}
                    selected={selectedStepId === row.step.stepId && selectedEpisodeId === null}
                    hovered={hoveredRowId === row.step.stepId}
                    onHover={() => setHoveredRowId(row.step.stepId)}
                    onToggleCollapsed={() => toggleCollapsed(row.step.stepId)}
                    onSelect={() => onSelectStep(row.step.stepId)}
                  />
                ) : (
                  <EpisodeRow
                    key={row.episode.episodeId}
                    pane="waterfall"
                    episode={row.episode}
                    depth={row.depth}
                    runId={view.runId}
                    bar={computeSpanWaterfallBar(row.episode, scale, nowMs)}
                    ticks={ticks}
                    selected={selectedEpisodeId === row.episode.episodeId}
                    hovered={hoveredRowId === row.episode.episodeId}
                    onHover={() => setHoveredRowId(row.episode.episodeId)}
                    onSelect={() => onSelectEpisode(row.step.stepId, row.episode)}
                  />
                ),
              )}
              <div className="relative min-h-0 flex-1 px-3">
                <div className="relative h-full min-h-0">
                  <WaterfallGridLines ticks={ticks} />
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      )}
      {showSplit ? (
        <ColumnResizeHandle
          left={split.handleLeft}
          dragging={split.dragging}
          onPointerDown={split.onPointerDown}
          onPointerMove={split.onPointerMove}
          onPointerUp={split.onPointerUp}
          onKeyDown={split.onKeyDown}
          onDoubleClick={split.onReset}
        />
      ) : null}
    </div>
  );
}

function StepsHeader() {
  return (
    <div className="sticky top-0 z-20 flex h-8 items-center border-b border-border/40 bg-background px-4 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
      Steps
    </div>
  );
}

function WaterfallHeader({ ticks }: { ticks: { pct: number; label: string }[] }) {
  return (
    <div className="sticky top-0 z-20 border-b border-border/40 bg-background px-3">
      <div className="relative h-8">
        <WaterfallGridLines ticks={ticks} />
        {ticks.map((tick) => (
          <span
            key={tick.pct}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground",
              tick.pct === 0
                ? "translate-x-0"
                : tick.pct === 100
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{ left: `${tick.pct}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const treeControlFocusClass =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function rowToneClass(selected: boolean, hovered: boolean) {
  if (selected) return hovered ? "bg-primary/15" : "bg-primary/10";
  if (hovered) return "bg-muted/70";
  return "bg-background";
}

function runStatusAsStep(status: RunViewState["status"]): StepNodeStatus {
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "completed";
}

function WorkflowRow({
  pane,
  workflowId,
  status,
  selected,
  hovered,
  collapsed,
  hiddenCount,
  bar,
  ticks,
  onHover,
  onToggleCollapsed,
  onSelect,
}: {
  pane: "tree" | "waterfall";
  workflowId: string;
  status: RunViewState["status"];
  selected: boolean;
  hovered: boolean;
  collapsed: boolean;
  hiddenCount: number;
  bar: WaterfallBar | null;
  ticks: { pct: number; label: string }[];
  onHover: () => void;
  onToggleCollapsed: () => void;
  onSelect: () => void;
}) {
  const stepStatus = runStatusAsStep(status);
  return (
    <GridRow
      pane={pane}
      selected={selected}
      hovered={hovered}
      onHover={onHover}
      onSelect={onSelect}
      ariaLabel={`${workflowId} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
      bar={bar}
      ticks={ticks}
      status={stepStatus}
      label={workflowId}
      barSize="step"
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
}

function StepRow({
  pane,
  step,
  depth,
  bar,
  ticks,
  collapsed,
  selected,
  hovered,
  onHover,
  onToggleCollapsed,
  onSelect,
}: {
  pane: "tree" | "waterfall";
  step: StepNode;
  depth: number;
  bar: WaterfallBar | null;
  ticks: { pct: number; label: string }[];
  collapsed: boolean;
  selected: boolean;
  hovered: boolean;
  onHover: () => void;
  onToggleCollapsed: () => void;
  onSelect: () => void;
}) {
  const label = formatStepLabel(step.name, step.key);
  const hasChildren = stepHasTreeChildren(step);
  const hiddenCount = step.children.length + step.agentEpisodes.length;

  return (
    <GridRow
      pane={pane}
      selected={selected}
      hovered={hovered}
      onHover={onHover}
      onSelect={onSelect}
      ariaLabel={`${label} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
      bar={bar}
      ticks={ticks}
      status={step.status}
      label={label}
      barSize="step"
      leading={
        <CollapseToggle
          expanded={!collapsed}
          disabled={!hasChildren}
          label={label}
          onToggle={onToggleCollapsed}
        />
      }
      trailing={<RowStatusIcon status={step.status} kind="step" />}
      depth={depth}
    >
      <Layers className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono font-medium">{label}</span>
      {collapsed && hiddenCount > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{hiddenCount}</span>
      ) : null}
      {step.status === "failed" && step.error ? (
        <ErrorIndicator error={step.error} className="min-w-0 text-[10px]" />
      ) : null}
    </GridRow>
  );
}

function EpisodeRow({
  pane,
  episode,
  depth,
  runId,
  bar,
  ticks,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  pane: "tree" | "waterfall";
  episode: AgentEpisode;
  depth: number;
  runId: string;
  bar: WaterfallBar | null;
  ticks: { pct: number; label: string }[];
  selected: boolean;
  hovered: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const scopeLabel = formatMemoryScopeLabel(episode.memoryScope, runId);
  const label = `${scopeLabel} · ${episode.agentId}`;

  return (
    <GridRow
      pane={pane}
      selected={selected}
      hovered={hovered}
      onHover={onHover}
      onSelect={onSelect}
      ariaLabel={`${label} duration ${bar ? formatDuration(bar.durationMs) : "unknown"}`}
      bar={bar}
      ticks={ticks}
      status={episode.status}
      label={label}
      barSize="episode"
      leading={<span className="size-3.5 shrink-0" aria-hidden />}
      trailing={<RowStatusIcon status={episode.status} kind="conversation" />}
      depth={depth}
    >
      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono font-medium" title={episode.memoryScope}>
        {scopeLabel}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">{episode.agentId}</span>
      {episode.status === "failed" && episode.error ? (
        <ErrorIndicator error={episode.error} className="min-w-0 text-[10px]" />
      ) : null}
    </GridRow>
  );
}

function GridRow({
  pane,
  selected,
  hovered,
  onHover,
  onSelect,
  ariaLabel,
  bar,
  ticks,
  status,
  label,
  barSize,
  leading,
  trailing,
  depth,
  children,
}: {
  pane: "tree" | "waterfall";
  selected: boolean;
  hovered: boolean;
  onHover: () => void;
  onSelect: () => void;
  ariaLabel: string;
  bar: WaterfallBar | null;
  ticks: { pct: number; label: string }[];
  status: StepNodeStatus;
  label: string;
  barSize: "step" | "episode";
  leading: ReactNode;
  trailing?: ReactNode;
  depth: number;
  children: ReactNode;
}) {
  const tone = rowToneClass(selected, hovered);
  if (pane === "waterfall") {
    return (
      <button
        type="button"
        tabIndex={-1}
        onClick={onSelect}
        onMouseEnter={onHover}
        className={cn("relative h-9 w-full shrink-0 px-3", ROW_DIVIDER, tone)}
        aria-hidden
      >
        <div className="relative">
          <WaterfallGridLines ticks={ticks} />
          <WaterfallTrack bar={bar} status={status} label={label} size={barSize} />
        </div>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 overflow-hidden border-l-2 py-1 pr-2",
        ROW_DIVIDER,
        tone,
        selected ? "border-l-primary" : "border-l-transparent",
      )}
      style={{ paddingLeft: 8 + depth * 16 }}
      onMouseEnter={onHover}
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
}

function CollapseToggle({
  expanded,
  disabled,
  label,
  onToggle,
}: {
  expanded: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
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

function WaterfallTrack({
  bar,
  status,
  label,
  size,
}: {
  bar: WaterfallBar | null;
  status: StepNodeStatus;
  label: string;
  size: "step" | "episode";
}) {
  return (
    <div className="relative h-8 overflow-hidden">
      {bar ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "absolute top-1/2 -translate-y-1/2 rounded-sm",
                size === "step" ? "h-3.5" : "h-2.5",
                status === "running" && "bg-primary/55",
                status === "completed" && (size === "step" ? "bg-primary/35" : "bg-primary/25"),
                status === "failed" && "bg-destructive/55",
              )}
              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
            >
              {status === "running" ? (
                <span className="absolute inset-y-0 right-0 w-0.5 rounded-r-sm bg-primary" />
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {label}: {formatDuration(bar.durationMs)}
            {status === "running" ? " elapsed" : ""}
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="sr-only">No timing yet</span>
      )}
      {bar ? (
        <span
          className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
          style={{
            left: `min(calc(${bar.leftPct + bar.widthPct}% + 6px), calc(100% - 2.75rem))`,
          }}
        >
          {formatDuration(bar.durationMs)}
        </span>
      ) : null}
    </div>
  );
}

function RowStatusIcon({
  status,
  kind,
}: {
  status: StepNodeStatus;
  kind: "step" | "conversation";
}) {
  if (status === "completed") return null;
  if (status === "running") {
    return (
      <Loader2
        className="size-3.5 shrink-0 animate-spin text-primary"
        aria-label={kind === "step" ? "Step running" : "Conversation running"}
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

function EmptyRunState({ status, error }: { status: RunViewState["status"]; error?: unknown }) {
  if (status === "failed") {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm font-medium text-destructive">
          This run failed before any steps started.
        </p>
        <ErrorDetails error={error ?? "Workflow run failed."} compact />
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Run cancelled before any steps started.
      </p>
    );
  }
  if (status === "completed") {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No steps recorded for this run.
      </p>
    );
  }
  return <WorkflowLoadingSkeleton />;
}

function WorkflowLoadingSkeleton() {
  const placeholders = [
    { depth: 1, width: "w-28" },
    { depth: 2, width: "w-24" },
    { depth: 1, width: "w-32" },
  ];

  return (
    <div
      className="flex h-full min-h-0 w-full"
      aria-busy="true"
      aria-label="Waiting for workflow steps"
    >
      <div className={cn("w-[40%] shrink-0", PANE_SPLIT)}>
        <div className={cn("flex h-8 items-center px-4", ROW_DIVIDER)}>
          <Skeleton className="h-3 w-12" />
        </div>
        <div
          className={cn("flex h-9 items-center gap-2 pr-2", ROW_DIVIDER)}
          style={{ paddingLeft: 8 }}
        >
          <ChevronRight className="size-3.5 shrink-0 rotate-90 text-muted-foreground" aria-hidden />
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Skeleton className="h-3 w-36" />
        </div>
        {placeholders.map((row, index) => (
          <div
            key={index}
            className={cn("flex h-9 items-center gap-2 pr-2", ROW_DIVIDER)}
            style={{ paddingLeft: 8 + row.depth * 16 }}
          >
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            <Skeleton className={cn("h-3", row.width)} />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("flex h-8 items-center px-3", ROW_DIVIDER)}>
          <span className="text-[10px] text-muted-foreground">Duration</span>
        </div>
      </div>
    </div>
  );
}

function useLiveNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const TREE_COL_MIN = 224;
const WATERFALL_COL_MIN = 192;
const TREE_COL_DEFAULT_RATIO = 0.4;
const WATERFALL_ZOOM_MIN = 1;
const WATERFALL_ZOOM_MAX = 16;

function clampTreeWidth(width: number, containerWidth: number): number {
  const max = Math.max(TREE_COL_MIN, containerWidth - WATERFALL_COL_MIN);
  return Math.min(Math.max(width, TREE_COL_MIN), max);
}

function clampWaterfallZoom(zoom: number): number {
  return Math.min(WATERFALL_ZOOM_MAX, Math.max(WATERFALL_ZOOM_MIN, zoom));
}

function useColumnSplit() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyWidth = useCallback((width: number) => {
    const nextContainer = containerRef.current?.clientWidth ?? 0;
    if (nextContainer <= 0) {
      setTreeWidth(width);
      return;
    }
    setTreeWidth(clampTreeWidth(width, nextContainer));
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const sync = () => {
      setTreeWidth((current) => {
        const fallback = Math.round(el.clientWidth * TREE_COL_DEFAULT_RATIO);
        return clampTreeWidth(current ?? fallback, el.clientWidth);
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const width =
        treeWidth ?? Math.round((containerRef.current?.clientWidth ?? 0) * TREE_COL_DEFAULT_RATIO);
      dragRef.current = { startX: event.clientX, startWidth: width };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [treeWidth],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyWidth(drag.startWidth + event.clientX - drag.startX);
    },
    [applyWidth],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onReset = useCallback(() => {
    const nextContainer = containerRef.current?.clientWidth ?? 0;
    applyWidth(Math.round(nextContainer * TREE_COL_DEFAULT_RATIO));
  }, [applyWidth]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const nextContainer = containerRef.current?.clientWidth ?? 0;
      const current = treeWidth ?? Math.round(nextContainer * TREE_COL_DEFAULT_RATIO);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        applyWidth(current - 16);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        applyWidth(current + 16);
      } else if (event.key === "Home") {
        event.preventDefault();
        applyWidth(TREE_COL_MIN);
      } else if (event.key === "End") {
        event.preventDefault();
        applyWidth(nextContainer - WATERFALL_COL_MIN);
      }
    },
    [applyWidth, treeWidth],
  );

  return {
    containerRef,
    treeWidth,
    handleLeft: treeWidth == null ? "40%" : treeWidth,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
    onReset,
  };
}

function useSyncedVerticalScroll(
  treeRef: RefObject<HTMLDivElement | null>,
  waterfallRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const tree = treeRef.current;
    const waterfall = waterfallRef.current;
    if (!tree || !waterfall) return;

    let source: "tree" | "waterfall" | null = null;

    const onTreeScroll = () => {
      if (source === "waterfall") return;
      source = "tree";
      waterfall.scrollTop = tree.scrollTop;
      source = null;
    };
    const onWaterfallScroll = () => {
      if (source === "tree") return;
      source = "waterfall";
      tree.scrollTop = waterfall.scrollTop;
      source = null;
    };

    tree.addEventListener("scroll", onTreeScroll, { passive: true });
    waterfall.addEventListener("scroll", onWaterfallScroll, { passive: true });
    return () => {
      tree.removeEventListener("scroll", onTreeScroll);
      waterfall.removeEventListener("scroll", onWaterfallScroll);
    };
  }, [treeRef, waterfallRef, enabled]);
}

function useScrollbarGutter(
  waterfallRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  rowCount: number,
) {
  const [gutter, setGutter] = useState(0);

  useLayoutEffect(() => {
    const el = waterfallRef.current;
    if (!el) return;

    const sync = () => {
      setGutter(Math.max(0, el.offsetHeight - el.clientHeight));
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [waterfallRef, zoom, rowCount]);

  return gutter;
}

function useWaterfallPaneWidth(
  waterfallRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  enabled: boolean,
) {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = waterfallRef.current;
    if (!el) return;

    const sync = () => {
      setWidth(el.clientWidth);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [waterfallRef, zoom, enabled]);

  return width;
}

function useWaterfallZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  setZoom: (zoom: number) => void,
  enabled: boolean,
) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const anchorRef = useRef<{ fraction: number; localX: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const viewport = scrollRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const current = zoomRef.current;
      const next = clampWaterfallZoom(current * 2 ** (-event.deltaY / 200));
      if (Math.abs(next - current) < 0.001) return;

      const rect = viewport.getBoundingClientRect();
      const localX = Math.max(0, event.clientX - rect.left);
      const contentWidth = Math.max(1, viewport.scrollWidth);
      const fraction = (viewport.scrollLeft + localX) / contentWidth;
      anchorRef.current = { fraction, localX };
      setZoom(next);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [scrollRef, setZoom, enabled]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.scrollLeft = anchor.fraction * viewport.scrollWidth - anchor.localX;
  }, [zoom, scrollRef]);
}

function WaterfallGridLines({ ticks }: { ticks: { pct: number }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <span
          key={tick.pct}
          className="absolute inset-y-0 w-px bg-border/40"
          style={tick.pct === 100 ? { right: 0 } : { left: `${tick.pct}%` }}
        />
      ))}
    </div>
  );
}

function ColumnResizeHandle({
  left,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onDoubleClick,
}: {
  left: number | string;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Resize tree and waterfall"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        "absolute inset-y-0 z-20 flex w-1.5 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center",
        "bg-transparent hover:bg-border focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden",
        dragging && "bg-border",
      )}
      style={{ left }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border",
          dragging && "bg-foreground/50",
        )}
      />
    </button>
  );
}
