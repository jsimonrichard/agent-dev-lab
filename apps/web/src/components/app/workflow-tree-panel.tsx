import {
  forwardRef,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  ExternalLink,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  RotateCcw,
  SquareArrowOutUpRight,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { ErrorIndicator } from "@/components/app/error-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMemoryScopeLabel, formatStepLabel } from "@/lib/view-model/run-projection";
import type {
  AgentEpisode,
  InspectorRunSummary,
  RunStatus,
  RunViewState,
  StepNode,
  StepNodeStatus,
} from "@/lib/view-model/types";
import { workflowRunSearch } from "@/lib/workflow/workflow-location";
import { cn } from "@/lib/utils";
import { useInspectorConnection } from "#/lib/inspector-connection";
import { workflowRunLabel } from "@/lib/workflow/workflow-location";
import {
  computeSpanWaterfallBar,
  computeWaterfallScale,
  flattenWorkflowRows,
  formatDuration,
  nestedRunHasExpandableChildren,
  runStatusAsStepStatus,
  runSummaryAsTimedSpan,
  stepHasTreeChildren,
  waterfallTickCount,
  waterfallTickMarks,
  type NestedRunTreeData,
  type WaterfallBar,
  type WaterfallScale,
  type WorkflowTreeRow,
} from "@/lib/workflow/workflow-waterfall";

const WORKFLOW_ROW_ID = "__workflow__";
const ROW_DIVIDER = "border-b border-border/40";

interface WorkflowTreePanelProps {
  view: RunViewState;
  childRuns: InspectorRunSummary[];
  nestedByRunId: ReadonlyMap<string, NestedRunTreeData>;
  expandedNestedRunIds: ReadonlySet<string>;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  selectedNestedRunId: string | null;
  workflowSelected: boolean;
  onSelectWorkflow: () => void;
  onSelectStep: (stepId: string, ownerRunId: string) => void;
  onSelectEpisode: (stepId: string, episode: AgentEpisode, ownerRunId: string) => void;
  onSelectNestedRun: (runId: string) => void;
  onToggleNestedExpanded: (runId: string) => void;
  canRetry?: boolean;
  retryBusy?: boolean;
  priorAttemptRunId?: string | null;
  priorAttemptWorkflowId?: string;
  onRetryFromStep?: (stepId: string, ownerRunId: string) => void;
  onOpenNestedRunPage?: (run: InspectorRunSummary) => void;
}

export function WorkflowTreePanel({
  view,
  childRuns,
  nestedByRunId,
  expandedNestedRunIds,
  selectedStepId,
  selectedEpisodeId,
  selectedNestedRunId,
  workflowSelected,
  onSelectWorkflow,
  onSelectStep,
  onSelectEpisode,
  onSelectNestedRun,
  onToggleNestedExpanded,
  canRetry = false,
  retryBusy = false,
  priorAttemptRunId = null,
  priorAttemptWorkflowId,
  onRetryFromStep,
  onOpenNestedRunPage,
}: WorkflowTreePanelProps) {
  const { offline } = useInspectorConnection();
  const live = view.status === "running" && !offline;
  const nowMs = useLiveNow(live);
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const scale = useMemo(
    () =>
      computeWaterfallScale({
        runStartedAt: view.startedAt,
        runFinishedAt: view.finishedAt,
        runStatus: view.status,
        steps: view.steps,
        nowMs,
        ownerRunId: view.runId,
        nestedRuns: childRuns,
        nestedByRunId,
        expandedNestedRunIds,
      }),
    [
      view.startedAt,
      view.finishedAt,
      view.status,
      view.steps,
      view.runId,
      nowMs,
      childRuns,
      nestedByRunId,
      expandedNestedRunIds,
    ],
  );
  const ticks = useMemo(() => waterfallTickMarks(scale, waterfallTickCount(zoom)), [scale, zoom]);
  const workflowCollapsed = collapsedStepIds.has(WORKFLOW_ROW_ID);
  const rows = useMemo(
    () =>
      workflowCollapsed
        ? []
        : flattenWorkflowRows(view.steps, {
            collapsedStepIds,
            expandedNestedRunIds,
            depth: 1,
            ownerRunId: view.runId,
            nestedRuns: childRuns,
            nestedByRunId,
          }),
    [
      view.steps,
      view.runId,
      collapsedStepIds,
      workflowCollapsed,
      childRuns,
      nestedByRunId,
      expandedNestedRunIds,
    ],
  );
  const workflowBar = useMemo(
    () =>
      computeSpanWaterfallBar(
        {
          startedAt: view.startedAt,
          finishedAt: view.finishedAt,
          status: runStatusAsStepStatus(view.status),
        },
        scale,
        nowMs,
      ),
    [view.startedAt, view.finishedAt, view.status, scale, nowMs],
  );
  const nestsByOwnerStep = useMemo(
    () => buildNestsByOwnerStep(view.runId, childRuns, nestedByRunId),
    [view.runId, childRuns, nestedByRunId],
  );
  const hiddenRootCount = rows.length;

  const toggleCollapsed = useCallback((stepId: string) => {
    startTransition(() => {
      setCollapsedStepIds((prev) => {
        const next = new Set(prev);
        if (next.has(stepId)) next.delete(stepId);
        else next.add(stepId);
        return next;
      });
    });
  }, []);
  const toggleWorkflowCollapsed = useCallback(() => {
    toggleCollapsed(WORKFLOW_ROW_ID);
  }, [toggleCollapsed]);

  // Parent callbacks are often new each render. Rows compare these identities,
  // so bridge through a ref and hand rows stable functions.
  const actionsRef = useRef({
    onSelectWorkflow,
    onSelectStep,
    onSelectEpisode,
    onSelectNestedRun,
    onToggleNestedExpanded,
    onOpenNestedRunPage,
  });
  actionsRef.current.onSelectWorkflow = onSelectWorkflow;
  actionsRef.current.onSelectStep = onSelectStep;
  actionsRef.current.onSelectEpisode = onSelectEpisode;
  actionsRef.current.onSelectNestedRun = onSelectNestedRun;
  actionsRef.current.onToggleNestedExpanded = onToggleNestedExpanded;
  actionsRef.current.onOpenNestedRunPage = onOpenNestedRunPage;

  const selectWorkflow = useCallback(() => {
    actionsRef.current.onSelectWorkflow();
  }, []);
  const selectStep = useCallback((stepId: string, ownerRunId: string) => {
    actionsRef.current.onSelectStep(stepId, ownerRunId);
  }, []);
  const selectEpisode = useCallback((stepId: string, episode: AgentEpisode, ownerRunId: string) => {
    actionsRef.current.onSelectEpisode(stepId, episode, ownerRunId);
  }, []);
  const selectNestedRun = useCallback((runId: string) => {
    actionsRef.current.onSelectNestedRun(runId);
  }, []);
  const toggleNestedExpanded = useCallback((runId: string) => {
    actionsRef.current.onToggleNestedExpanded(runId);
  }, []);
  const openNestedRunPage = useCallback((run: InspectorRunSummary) => {
    actionsRef.current.onOpenNestedRunPage?.(run);
  }, []);

  const split = useColumnSplit();
  const crossHoveredIdRef = useRef<string | null>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const waterfallScrollRef = useRef<HTMLDivElement>(null);
  const scrollbarGutter = useScrollbarGutter(waterfallScrollRef, zoom, rows.length);
  const waterfallPaneWidth = useWaterfallPaneWidth(waterfallScrollRef, zoom, true);
  useSyncedVerticalScroll(treeScrollRef, waterfallScrollRef, true);
  useWaterfallZoom(waterfallScrollRef, zoom, setZoom, true);

  const syncCrossHover = useCallback(
    (rowId: string | null) => {
      const root = split.containerRef.current;
      if (!root || rowId === crossHoveredIdRef.current) {
        return;
      }
      if (crossHoveredIdRef.current) {
        root
          .querySelectorAll(`[data-row-id="${CSS.escape(crossHoveredIdRef.current)}"]`)
          .forEach((el) => {
            el.removeAttribute("data-cross-hovered");
          });
      }
      crossHoveredIdRef.current = rowId;
      if (rowId) {
        root.querySelectorAll(`[data-row-id="${CSS.escape(rowId)}"]`).forEach((el) => {
          el.setAttribute("data-cross-hovered", "");
        });
      }
    },
    [split.containerRef],
  );

  const ownerRunStatus = useCallback(
    (ownerRunId: string): RunStatus => {
      if (ownerRunId === view.runId) {
        return view.status;
      }
      return nestedByRunId.get(ownerRunId)?.view?.status ?? "completed";
    },
    [nestedByRunId, view.runId, view.status],
  );

  const renderTreeRow = (row: WorkflowTreeRow, pane: "tree" | "waterfall") => {
    if (row.kind === "step") {
      const nestsUnder =
        nestsByOwnerStep.get(`${row.ownerRunId}\0${row.step.stepId}`) ?? EMPTY_NESTS;
      const ownerStatus = ownerRunStatus(row.ownerRunId);
      const showRetry =
        canRetry && !retryBusy && ownerStatus !== "running" && onRetryFromStep != null;
      const stepRow = (
        <StepRow
          key={`step:${row.ownerRunId}:${row.step.stepId}:${pane}`}
          pane={pane}
          step={row.step}
          ownerRunId={row.ownerRunId}
          depth={row.depth}
          nestedUnderStep={nestsUnder}
          scale={scale}
          nowMs={nowMs}
          ticks={ticks}
          collapsed={collapsedStepIds.has(row.step.stepId)}
          selected={
            selectedStepId === row.step.stepId &&
            selectedEpisodeId === null &&
            selectedNestedRunId === null
          }
          onToggleCollapsed={toggleCollapsed}
          onSelectStep={selectStep}
          priorAttemptRunId={priorAttemptRunId}
          priorAttemptWorkflowId={priorAttemptWorkflowId ?? view.workflowId}
        />
      );
      const stepMenu =
        showRetry || (row.step.replayedFromStepId && priorAttemptRunId) ? (
          <>
            {showRetry ? (
              <ContextMenuItem onSelect={() => onRetryFromStep!(row.step.stepId, row.ownerRunId)}>
                <RotateCcw className="mr-2 size-4" />
                Retry from here
              </ContextMenuItem>
            ) : null}
            {row.step.replayedFromStepId && priorAttemptRunId ? (
              <>
                {showRetry ? <ContextMenuSeparator /> : null}
                <ContextMenuItem asChild>
                  <Link
                    to="/workflows/$workflowId/run/$runId"
                    params={{
                      workflowId: priorAttemptWorkflowId ?? view.workflowId,
                      runId: priorAttemptRunId,
                    }}
                    search={workflowRunSearch({ step: row.step.replayedFromStepId })}
                  >
                    <SquareArrowOutUpRight className="mr-2 size-4" />
                    View original step
                  </Link>
                </ContextMenuItem>
              </>
            ) : null}
          </>
        ) : null;
      return wrapRowContextMenu(
        `step-menu:${row.ownerRunId}:${row.step.stepId}:${pane}`,
        stepRow,
        stepMenu,
      );
    }
    if (row.kind === "episode") {
      return (
        <EpisodeRow
          key={`ep:${row.ownerRunId}:${row.episode.episodeId}:${pane}`}
          pane={pane}
          episode={row.episode}
          stepId={row.step.stepId}
          depth={row.depth}
          runId={row.ownerRunId}
          scale={scale}
          nowMs={nowMs}
          ticks={ticks}
          selected={selectedEpisodeId === row.episode.episodeId}
          onSelectEpisode={selectEpisode}
        />
      );
    }
    const nestedData = nestedByRunId.get(row.run.runId);
    const expanded = expandedNestedRunIds.has(row.run.runId);
    const loading = expanded && nestedData?.view == null;
    const nestedRow = (
      <NestedRunRow
        key={`nest:${row.run.runId}:${pane}`}
        pane={pane}
        run={row.run}
        depth={row.depth}
        scale={scale}
        nowMs={nowMs}
        ticks={ticks}
        expanded={expanded}
        expandable={nestedRunHasExpandableChildren(nestedData)}
        loading={loading}
        selected={selectedNestedRunId === row.run.runId && selectedStepId === null}
        onToggleExpanded={toggleNestedExpanded}
        onSelectNestedRun={selectNestedRun}
        copiedFromPriorAttempt={row.run.replayOfRunId != null}
        onOpenNestedRunPage={onOpenNestedRunPage ? openNestedRunPage : undefined}
      />
    );
    const nestedMenu =
      onOpenNestedRunPage != null ? (
        <>
          <ContextMenuItem onSelect={() => onOpenNestedRunPage(row.run)}>
            <ExternalLink className="mr-2 size-4" />
            View run separately
          </ContextMenuItem>
          {row.run.replayOfRunId ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() =>
                  onOpenNestedRunPage({
                    ...row.run,
                    runId: row.run.replayOfRunId!,
                  })
                }
              >
                <SquareArrowOutUpRight className="mr-2 size-4" />
                View original run
              </ContextMenuItem>
            </>
          ) : null}
        </>
      ) : null;
    return wrapRowContextMenu(`nest-menu:${row.run.runId}:${pane}`, nestedRow, nestedMenu);
  };

  return (
    <div
      ref={split.containerRef}
      className={cn(
        "relative flex h-full min-h-0 bg-background",
        split.dragging && "cursor-col-resize select-none",
      )}
      onMouseOver={(event) => {
        const row = (event.target as Element | null)?.closest?.("[data-row-id]");
        syncCrossHover(row?.getAttribute("data-row-id") ?? null);
      }}
      onMouseLeave={() => syncCrossHover(null)}
    >
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
              collapsed={workflowCollapsed}
              hiddenCount={hiddenRootCount}
              bar={workflowBar}
              ticks={ticks}
              onToggleCollapsed={toggleWorkflowCollapsed}
              onSelect={selectWorkflow}
            />
            {rows.map((row) => renderTreeRow(row, "tree"))}
            {view.status === "running" && rows.length === 0 && !workflowCollapsed ? (
              <WorkflowLoadingPlaceholder />
            ) : null}
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
                waterfallPaneWidth > 0 ? waterfallPaneWidth * zoom : `${Math.max(zoom, 1) * 100}%`,
            }}
          >
            <WaterfallHeader ticks={ticks} />
            <WorkflowRow
              pane="waterfall"
              workflowId={view.workflowId}
              status={view.status}
              selected={workflowSelected}
              collapsed={workflowCollapsed}
              hiddenCount={hiddenRootCount}
              bar={workflowBar}
              ticks={ticks}
              onToggleCollapsed={toggleWorkflowCollapsed}
              onSelect={selectWorkflow}
            />
            {rows.map((row) => renderTreeRow(row, "waterfall"))}
            {view.status === "running" && rows.length === 0 && !workflowCollapsed ? (
              <div className={cn("h-9 shrink-0", ROW_DIVIDER)} aria-hidden />
            ) : null}
            <div className="relative min-h-0 flex-1 px-3">
              <div className="relative h-full min-h-0">
                <WaterfallGridLines ticks={ticks} />
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
      <ColumnResizeHandle
        left={split.handleLeft}
        dragging={split.dragging}
        onPointerDown={split.onPointerDown}
        onPointerMove={split.onPointerMove}
        onPointerUp={split.onPointerUp}
        onKeyDown={split.onKeyDown}
        onDoubleClick={split.onReset}
      />
    </div>
  );
}

const EMPTY_NESTS: InspectorRunSummary[] = [];

function buildNestsByOwnerStep(
  pageRunId: string,
  pageChildRuns: readonly InspectorRunSummary[],
  nestedByRunId: ReadonlyMap<string, NestedRunTreeData>,
): Map<string, InspectorRunSummary[]> {
  const map = new Map<string, InspectorRunSummary[]>();
  const add = (ownerRunId: string, runs: readonly InspectorRunSummary[]) => {
    const byParent = new Map<string, InspectorRunSummary[]>();
    for (const run of runs) {
      const parent = run.parentStepId ?? "";
      const list = byParent.get(parent);
      if (list) {
        list.push(run);
      } else {
        byParent.set(parent, [run]);
      }
    }
    for (const [parent, list] of byParent) {
      map.set(`${ownerRunId}\0${parent}`, list);
    }
  };
  add(pageRunId, pageChildRuns);
  for (const [runId, data] of nestedByRunId) {
    if (data.childRuns && data.childRuns.length > 0) {
      add(runId, data.childRuns);
    }
  }
  return map;
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

/** Row background: CSS :hover for the active pane, data-cross-hovered for the synced pane. */
const rowToneClass = (selected: boolean) =>
  cn(
    "bg-background hover:bg-muted/70 data-[cross-hovered]:bg-muted/70",
    selected && "bg-primary/10 hover:bg-primary/15 data-[cross-hovered]:bg-primary/15",
  );

function runStatusAsStep(status: RunViewState["status"]): StepNodeStatus {
  return runStatusAsStepStatus(status);
}

const WorkflowRow = memo(function WorkflowRow({
  pane,
  workflowId,
  status,
  selected,
  collapsed,
  hiddenCount,
  bar,
  ticks,
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
  ticks: { pct: number; label: string }[];
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
});

function wrapRowContextMenu(key: string, row: ReactElement, menu: ReactNode | null): ReactNode {
  if (!menu) {
    return row;
  }
  return (
    <TreeRowContextMenu key={key} menu={menu}>
      {row}
    </TreeRowContextMenu>
  );
}

function TreeRowContextMenu({ menu, children }: { menu: ReactNode; children: ReactElement }) {
  return (
    <ContextMenu>
      {/* `contents` keeps the trigger from adding a box; Radix slot props stay off the memoized row. */}
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="duration-0 data-[state=closed]:animate-none data-[state=open]:animate-none">
        {menu}
      </ContextMenuContent>
    </ContextMenu>
  );
}

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
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/workflows/$workflowId/run/$runId"
            params={{ workflowId: href.workflowId, runId: href.runId }}
            search={href.stepId ? workflowRunSearch({ step: href.stepId }) : undefined}
            className="shrink-0 hover:opacity-80"
            onClick={(event) => event.stopPropagation()}
          >
            {body}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    );
  }
  if (onOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="shrink-0 hover:opacity-80"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            {body}
          </button>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0">{body}</span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

type SlotDomProps = Omit<HTMLAttributes<HTMLElement>, "children" | "onSelect" | "color">;

const StepRow = memo(
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
      ticks: { pct: number; label: string }[];
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
      ticks,
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
        ticks={ticks}
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
);

const NestedRunRow = memo(
  forwardRef<
    HTMLElement,
    {
      pane: "tree" | "waterfall";
      run: InspectorRunSummary;
      depth: number;
      scale: WaterfallScale;
      nowMs: number;
      ticks: { pct: number; label: string }[];
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
      ticks,
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
        ticks={ticks}
        status={status}
        label={label}
        barSize="step"
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
);

const EpisodeRow = memo(function EpisodeRow({
  pane,
  episode,
  stepId,
  depth,
  runId,
  scale,
  nowMs,
  ticks,
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
  ticks: { pct: number; label: string }[];
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
});

const GridRow = forwardRef<
  HTMLElement,
  {
    pane: "tree" | "waterfall";
    rowId: string;
    selected: boolean;
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
  } & SlotDomProps
>(function GridRow(
  {
    pane,
    rowId,
    selected,
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
        className={cn("relative h-9 w-full shrink-0 px-3", ROW_DIVIDER, tone, className)}
        style={style}
        {...slotProps}
        onClick={(event) => {
          onClick?.(event);
          onSelect();
        }}
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

function waterfallBarTooltip(bar: WaterfallBar, label: string, status: StepNodeStatus): string {
  if (bar.copied) {
    const parts = [
      `${label}: prior layout ${formatDuration(bar.durationMs)}`,
      bar.priorDurationMs != null ? `full prior ${formatDuration(bar.priorDurationMs)}` : null,
      bar.continuation
        ? `continuation past retry ${formatDuration(bar.continuation.durationMs)}`
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }
  return `${label}: ${formatDuration(bar.durationMs)}${status === "running" ? " elapsed" : ""}`;
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
  const heightClass = size === "step" ? "h-3.5" : "h-2.5";
  return (
    <div className="relative h-8 overflow-hidden">
      {bar?.continuation ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "absolute top-1/2 z-0 -translate-y-1/2 rounded-sm border border-dashed border-amber-500/40 bg-amber-500/15 opacity-50",
                heightClass,
              )}
              style={{
                left: `${bar.continuation.leftPct}%`,
                width: `${bar.continuation.widthPct}%`,
              }}
              aria-hidden
            />
          </TooltipTrigger>
          <TooltipContent>
            Prior work continued {formatDuration(bar.continuation.durationMs)} past the retry point
            (not re-measured on this attempt)
          </TooltipContent>
        </Tooltip>
      ) : null}
      {bar ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "absolute top-1/2 z-[1] -translate-y-1/2 rounded-sm",
                heightClass,
                bar.copied &&
                  "border border-dashed border-sky-500/50 bg-sky-500/20 dark:bg-sky-400/15",
                !bar.copied && status === "running" && "bg-primary/55",
                !bar.copied &&
                  status === "completed" &&
                  (size === "step" ? "bg-primary/35" : "bg-primary/25"),
                !bar.copied && status === "failed" && "bg-destructive/55",
              )}
              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
            >
              {!bar.copied && status === "running" ? (
                <span className="absolute inset-y-0 right-0 w-0.5 rounded-r-sm bg-primary" />
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>{waterfallBarTooltip(bar, label, status)}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="sr-only">No timing yet</span>
      )}
      {bar ? <WaterfallDuration bar={bar} status={status} /> : null}
    </div>
  );
}

function waterfallDurationOffset(bar: WaterfallBar): string {
  return `min(calc(${bar.leftPct + bar.widthPct}% + 6px), calc(100% - 2.75rem))`;
}

function WaterfallDuration({ bar, status }: { bar: WaterfallBar; status: StepNodeStatus }) {
  const duration = formatDuration(bar.durationMs);
  const left = waterfallDurationOffset(bar);
  const rightClipPct = Math.max(0, 100 - bar.leftPct - bar.widthPct);
  const labelClass =
    "absolute top-1/2 -translate-y-1/2 font-mono text-[10px] leading-none tabular-nums";

  return (
    <>
      <span
        className={cn("pointer-events-none z-1 text-muted-foreground", labelClass)}
        style={{ left }}
      >
        {duration}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-1 overflow-hidden"
        style={{
          clipPath: `inset(0 ${rightClipPct}% 0 ${bar.leftPct}%)`,
        }}
      >
        <span
          className={cn(labelClass, status === "failed" ? "text-white" : "text-black")}
          style={{ left }}
        >
          {duration}
        </span>
      </span>
    </>
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

function WorkflowLoadingPlaceholder() {
  return (
    <div
      className={cn("flex h-9 shrink-0 items-center gap-2 pr-2", ROW_DIVIDER)}
      style={{ paddingLeft: 8 + 16 }}
      aria-busy="true"
      aria-label="Waiting for workflow steps"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function useLiveNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      startTransition(() => setNow(Date.now()));
    }, 1000);
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
