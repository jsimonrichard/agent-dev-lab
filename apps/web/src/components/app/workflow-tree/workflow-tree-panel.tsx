import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";

import type {
  AgentEpisode,
  InspectorRunSummary,
  RunStatus,
  RunViewState,
} from "@/lib/view-model/types";
import { retryAnchorMs } from "@/lib/workflow/copied-waterfall-timing";
import { cn } from "@/lib/utils";
import { useInspectorConnection } from "#/lib/inspector-connection";
import {
  computeSpanWaterfallBar,
  computeWaterfallScale,
  flattenWorkflowRows,
  nestedRunHasExpandableChildren,
  runStatusAsStepStatus,
  waterfallAxisStyle,
  waterfallTickCount,
  type NestedRunTreeData,
  type WorkflowTreeRow,
} from "@/lib/workflow/workflow-waterfall";

import { ROW_DIVIDER, WORKFLOW_ROW_ID } from "./constants";
import { hideHoverTip, scheduleHoverTip } from "./hover-tip";
import {
  ColumnResizeHandle,
  createLiveNowStore,
  LiveNowStoreContext,
  useColumnSplit,
  useScrollbarGutter,
  useSyncedVerticalScroll,
  useWaterfallZoom,
} from "./layout";
import { EMPTY_NESTS, buildNestsByOwnerStep } from "./nests";
import { PanelRowMenu, type RowMenu } from "./panel-row-menu";
import { EpisodeRow, NestedRunRow, StepRow, WorkflowRow } from "./rows";
import { TreePane, WorkflowLoadingPlaceholder } from "./tree-pane";
import { WaterfallPane } from "./waterfall-pane";

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
  /** Retry the page workflow from its first failed step, else its first step. */
  onRetryWorkflow?: () => void;
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
  onRetryWorkflow,
  onOpenNestedRunPage,
}: WorkflowTreePanelProps) {
  const { offline } = useInspectorConnection();
  const live = view.status === "running" && !offline;
  const liveNowStoreRef = useRef(createLiveNowStore(0));
  const waterfallAxisRef = useRef<HTMLDivElement>(null);
  const [nowMs, setNowMs] = useState(0);
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
        runCopiedPrefixMs: view.copiedPrefixMs,
      }),
    [
      view.startedAt,
      view.finishedAt,
      view.status,
      view.steps,
      view.runId,
      view.copiedPrefixMs,
      nowMs,
      childRuns,
      nestedByRunId,
      expandedNestedRunIds,
    ],
  );
  useEffect(() => {
    const store = liveNowStoreRef.current;
    const applyAxis = (now: number) => {
      store.set(now);
      const nextScale = computeWaterfallScale({
        runStartedAt: view.startedAt,
        runFinishedAt: view.finishedAt,
        runStatus: view.status,
        steps: view.steps,
        nowMs: now,
        ownerRunId: view.runId,
        nestedRuns: childRuns,
        nestedByRunId,
        expandedNestedRunIds,
        runCopiedPrefixMs: view.copiedPrefixMs,
      });
      const el = waterfallAxisRef.current;
      if (!el) return;
      const vars = waterfallAxisStyle(nextScale, now);
      el.style.setProperty("--wf-origin", vars["--wf-origin"]);
      el.style.setProperty("--wf-span", vars["--wf-span"]);
      el.style.setProperty("--wf-now", vars["--wf-now"]);
    };
    const now = Date.now();
    setNowMs(now);
    applyAxis(now);
    if (!live) return;
    const id = window.setInterval(() => {
      applyAxis(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    live,
    view.startedAt,
    view.finishedAt,
    view.status,
    view.steps,
    view.runId,
    view.copiedPrefixMs,
    childRuns,
    nestedByRunId,
    expandedNestedRunIds,
  ]);
  const ticks = useMemo(() => {
    const count = waterfallTickCount(zoom);
    const last = Math.max(2, count) - 1;
    return Array.from({ length: last + 1 }, (_, i) => ({ pct: (i / last) * 100 }));
  }, [zoom]);
  const retryAnchor = useMemo(() => {
    if (!priorAttemptRunId) return null;
    return retryAnchorMs(view.steps);
  }, [priorAttemptRunId, view.steps]);
  const workflowCollapsed = collapsedStepIds.has(WORKFLOW_ROW_ID);
  // Count rows as if the workflow row were expanded. `rows` is empty while it
  // is collapsed, and the chevron uses this count to decide it has children.
  const expandedRows = useMemo(
    () =>
      flattenWorkflowRows(view.steps, {
        collapsedStepIds,
        expandedNestedRunIds,
        depth: 1,
        ownerRunId: view.runId,
        nestedRuns: childRuns,
        nestedByRunId,
      }),
    [view.steps, view.runId, collapsedStepIds, childRuns, nestedByRunId, expandedNestedRunIds],
  );
  const rows = workflowCollapsed ? [] : expandedRows;
  const workflowBar = useMemo(
    () =>
      computeSpanWaterfallBar(
        {
          startedAt: view.startedAt,
          finishedAt: view.finishedAt,
          status: runStatusAsStepStatus(view.status),
          copiedPrefixMs: view.copiedPrefixMs,
        },
        scale,
        nowMs,
      ),
    [view.startedAt, view.finishedAt, view.status, view.copiedPrefixMs, scale, nowMs],
  );
  const nestsByOwnerStep = useMemo(
    () => buildNestsByOwnerStep(view.runId, childRuns, nestedByRunId),
    [view.runId, childRuns, nestedByRunId],
  );
  const hiddenRootCount = expandedRows.length;

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
    onRetryFromStep,
    onRetryWorkflow,
  });
  actionsRef.current.onSelectWorkflow = onSelectWorkflow;
  actionsRef.current.onSelectStep = onSelectStep;
  actionsRef.current.onSelectEpisode = onSelectEpisode;
  actionsRef.current.onSelectNestedRun = onSelectNestedRun;
  actionsRef.current.onToggleNestedExpanded = onToggleNestedExpanded;
  actionsRef.current.onOpenNestedRunPage = onOpenNestedRunPage;
  actionsRef.current.onRetryFromStep = onRetryFromStep;
  actionsRef.current.onRetryWorkflow = onRetryWorkflow;

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

  const rowMenusRef = useRef(new Map<string, RowMenu>());
  rowMenusRef.current.clear();
  const priorWorkflowId = priorAttemptWorkflowId ?? view.workflowId;
  for (const row of rows) {
    if (row.kind === "step") {
      const ownerStatus = ownerRunStatus(row.ownerRunId);
      const showRetry =
        canRetry && !retryBusy && ownerStatus !== "running" && onRetryFromStep != null;
      if (showRetry || (row.step.replayedFromStepId && priorAttemptRunId)) {
        rowMenusRef.current.set(row.step.stepId, {
          kind: "step",
          stepId: row.step.stepId,
          ownerRunId: row.ownerRunId,
          showRetry,
          replayedFromStepId: row.step.replayedFromStepId ?? null,
          priorRunId: priorAttemptRunId,
          workflowId: priorWorkflowId,
        });
      }
    } else if (row.kind === "nested-run" && onOpenNestedRunPage) {
      rowMenusRef.current.set(row.run.runId, { kind: "nested", run: row.run });
    }
  }
  if (
    canRetry &&
    !retryBusy &&
    view.status !== "running" &&
    view.steps.length > 0 &&
    onRetryWorkflow != null
  ) {
    rowMenusRef.current.set(WORKFLOW_ROW_ID, { kind: "workflow" });
  }

  const [openMenu, setOpenMenu] = useState<RowMenu | null>(null);
  const openMenuRef = useRef<RowMenu | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const onPanelContextMenu = (event: ReactMouseEvent) => {
    const row = (event.target as Element | null)?.closest?.("[data-row-id]");
    const rowId = row?.getAttribute("data-row-id") ?? "";
    const menu = row ? rowMenusRef.current.get(rowId) : undefined;
    if (!menu) {
      event.stopPropagation();
      return;
    }
    openMenuRef.current = menu;
    setOpenMenu(menu);
  };

  const renderTreeRow = (row: WorkflowTreeRow, pane: "tree" | "waterfall") => {
    if (row.kind === "step") {
      const nestsUnder =
        nestsByOwnerStep.get(`${row.ownerRunId}\0${row.step.stepId}`) ?? EMPTY_NESTS;
      return (
        <StepRow
          key={`step:${row.ownerRunId}:${row.step.stepId}:${pane}`}
          pane={pane}
          step={row.step}
          ownerRunId={row.ownerRunId}
          depth={row.depth}
          nestedUnderStep={nestsUnder}
          scale={scale}
          nowMs={nowMs}
          collapsed={collapsedStepIds.has(row.step.stepId)}
          selected={
            selectedStepId === row.step.stepId &&
            selectedEpisodeId === null &&
            selectedNestedRunId === null
          }
          onToggleCollapsed={toggleCollapsed}
          onSelectStep={selectStep}
          priorAttemptRunId={priorAttemptRunId}
          priorAttemptWorkflowId={priorWorkflowId}
        />
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
          selected={selectedEpisodeId === row.episode.episodeId}
          onSelectEpisode={selectEpisode}
        />
      );
    }
    const nestedData = nestedByRunId.get(row.run.runId);
    const expanded = expandedNestedRunIds.has(row.run.runId);
    return (
      <NestedRunRow
        key={`nest:${row.run.runId}:${pane}`}
        pane={pane}
        run={row.run}
        depth={row.depth}
        scale={scale}
        nowMs={nowMs}
        expanded={expanded}
        expandable={nestedRunHasExpandableChildren(nestedData)}
        loading={expanded && nestedData?.view == null}
        selected={selectedNestedRunId === row.run.runId && selectedStepId === null}
        onToggleExpanded={toggleNestedExpanded}
        onSelectNestedRun={selectNestedRun}
        copiedFromPriorAttempt={row.run.replayOfRunId != null}
        onOpenNestedRunPage={onOpenNestedRunPage ? openNestedRunPage : undefined}
      />
    );
  };

  const workflowRowProps = {
    workflowId: view.workflowId,
    status: view.status,
    selected: workflowSelected,
    collapsed: workflowCollapsed,
    hiddenCount: hiddenRootCount,
    bar: workflowBar,
    onToggleCollapsed: toggleWorkflowCollapsed,
    onSelect: selectWorkflow,
  };

  return (
    <LiveNowStoreContext.Provider value={liveNowStoreRef.current}>
      <div
        ref={split.containerRef}
        className={cn(
          "relative flex h-full min-h-0 bg-background",
          split.dragging && "cursor-col-resize select-none",
        )}
        onMouseOver={(event) => {
          const target = event.target as Element | null;
          const row = target?.closest?.("[data-row-id]");
          syncCrossHover(row?.getAttribute("data-row-id") ?? null);
          scheduleHoverTip(tipRef.current, target);
        }}
        onMouseLeave={() => {
          syncCrossHover(null);
          hideHoverTip(tipRef.current);
        }}
        onContextMenuCapture={onPanelContextMenu}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex h-full min-h-0 w-full">
              <TreePane
                scrollRef={treeScrollRef}
                width={split.treeWidth ?? "40%"}
                scrollbarGutter={scrollbarGutter}
              >
                <WorkflowRow pane="tree" {...workflowRowProps} />
                {rows.map((row) => renderTreeRow(row, "tree"))}
                {view.status === "running" && rows.length === 0 && !workflowCollapsed ? (
                  <WorkflowLoadingPlaceholder />
                ) : null}
              </TreePane>
              <WaterfallPane
                scrollRef={waterfallScrollRef}
                axisRef={waterfallAxisRef}
                zoom={zoom}
                scale={scale}
                nowMs={nowMs}
                live={live}
                ticks={ticks}
                retryAnchorMs={retryAnchor}
              >
                <WorkflowRow pane="waterfall" {...workflowRowProps} />
                {rows.map((row) => renderTreeRow(row, "waterfall"))}
                {view.status === "running" && rows.length === 0 && !workflowCollapsed ? (
                  <div className={cn("relative z-[1] h-9 shrink-0", ROW_DIVIDER)} aria-hidden />
                ) : null}
              </WaterfallPane>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="duration-0 data-[state=closed]:animate-none data-[state=open]:animate-none">
            <PanelRowMenu
              menu={openMenuRef.current ?? openMenu}
              onRetryFromStep={(stepId, ownerRunId) =>
                actionsRef.current.onRetryFromStep?.(stepId, ownerRunId)
              }
              onRetryWorkflow={() => actionsRef.current.onRetryWorkflow?.()}
              onOpenNestedRunPage={(run) => actionsRef.current.onOpenNestedRunPage?.(run)}
            />
          </ContextMenuContent>
        </ContextMenu>
        <div
          ref={tipRef}
          data-testid="waterfall-hover-tip"
          className="pointer-events-none fixed z-50 hidden w-fit max-w-xs -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-3 py-1.5 text-center text-xs text-balance text-background"
        />
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
    </LiveNowStoreContext.Provider>
  );
}
