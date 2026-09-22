import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, PanelRight, RotateCcw } from "lucide-react";

import {
  cancelInspectionWorkflowRun,
  fetchChildWorkflowRuns,
  fetchMessagesForWorkflowRun,
  fetchWorkflowRun,
  retryInspectionWorkflowRun,
} from "#/lib/inspector/inspector-server";
import { useInspectorConnection } from "#/lib/inspector-connection";
import {
  buildRunViewState,
  collectRunWarnings,
  findEpisodeInTree,
  findStepInTree,
  mergeSeededStepRecords,
  resolveRetryStepId,
  resolveRunSelection,
  type SeededStepProjection,
} from "@/lib/view-model/run-projection";
import type {
  AgentEpisode,
  InspectorRunSummary,
  PrefetchedRunMessages,
  RunEvent,
  RunViewState,
} from "@/lib/view-model/types";
import { useWorkflowRunEvents } from "@/hooks/use-workflow-run-events";
import { ErrorIndicator } from "@/components/app/error-details";
import { RunStatusBadge } from "@/components/app/run-status-badge";
import { WorkflowTreePanel } from "@/components/app/workflow-tree-panel";
import { StepInspectorPanel } from "@/components/app/step-inspector-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { workflowRunLabel, workflowRunSearch } from "@/lib/workflow/workflow-location";
import type { NestedRunTreeData } from "@/lib/workflow/workflow-waterfall";
import {
  buildPriorStepTimingIndex,
  graftCopiedWaterfallTiming,
  mergePriorRunTiming,
  type PriorTimingIndex,
} from "@/lib/workflow/copied-waterfall-timing";

const runRoute = getRouteApi("/_app/workflows/$workflowId/run/$runId");

interface RunWorkspaceProps {
  summary: InspectorRunSummary;
  initialEvents: RunEvent[];
  seededStepRecords?: SeededStepProjection[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  parentSummary?: InspectorRunSummary | null;
  childRuns?: InspectorRunSummary[];
}

type NestedCacheEntry = {
  summary: InspectorRunSummary;
  events: RunEvent[];
  childRuns: InspectorRunSummary[];
};

export function RunWorkspace({
  summary,
  initialEvents,
  seededStepRecords = [],
  messagesPromise,
  parentSummary = null,
  childRuns: initialChildRuns = [],
}: RunWorkspaceProps) {
  const search = runRoute.useSearch();
  const navigate = useNavigate({ from: "/workflows/$workflowId/run/$runId" });
  const router = useRouter();
  const { offline } = useInspectorConnection();
  const events = useWorkflowRunEvents(summary.runId, initialEvents);
  const [priorTiming, setPriorTiming] = useState<PriorTimingIndex | null>(null);
  const [pageChildRuns, setPageChildRuns] = useState(initialChildRuns);
  useEffect(() => {
    setPageChildRuns(initialChildRuns);
  }, [summary.runId, initialChildRuns]);

  const nestedPriorReplayKey = useMemo(
    () =>
      pageChildRuns
        .map((child) => child.replayOfRunId)
        .filter((id): id is string => id != null)
        .sort()
        .join("\0"),
    [pageChildRuns],
  );

  useEffect(() => {
    const priorRunId = summary.retriesFromRunId;
    if (!priorRunId) {
      setPriorTiming(null);
      return;
    }
    let cancelled = false;
    void fetchWorkflowRun({ data: priorRunId }).then(async (data) => {
      if (cancelled || !data) {
        return;
      }
      const index = buildPriorStepTimingIndex(data.events);
      mergePriorRunTiming(index, data.summary.runId, data.summary);
      const nestedPriorIds = nestedPriorReplayKey
        ? nestedPriorReplayKey.split("\0").filter(Boolean)
        : [];
      await Promise.all(
        nestedPriorIds.map(async (runId) => {
          const nested = await fetchWorkflowRun({ data: runId });
          if (nested) {
            mergePriorRunTiming(index, runId, nested.summary);
          }
        }),
      );
      if (!cancelled) {
        setPriorTiming(index);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [summary.retriesFromRunId, summary.runId, nestedPriorReplayKey]);

  const { view, displayChildRuns } = useMemo(() => {
    const built = buildRunViewState(summary.runId, events);
    mergeSeededStepRecords(built, seededStepRecords);
    const runs = pageChildRuns.map((run) => ({ ...run }));
    if (priorTiming) {
      graftCopiedWaterfallTiming(built, priorTiming, runs);
    }
    return { view: built, displayChildRuns: runs };
  }, [summary.runId, events, seededStepRecords, priorTiming, pageChildRuns]);
  const runWarnings = useMemo(() => collectRunWarnings(view.steps), [view.steps]);
  const runTitle = view.title ?? summary.title;

  // Refresh sidebar run totals once the workflow settles. Per-episode
  // `agent_finished` must not invalidate — that replaced `messagesPromise` and
  // remounted the step conversation into "No conversation recorded."
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) {
      return;
    }
    if (
      last.type === "run_started" ||
      last.type === "run_finished" ||
      last.type === "run_failed" ||
      last.type === "run_cancelled"
    ) {
      void router.invalidate();
    }
  }, [events, router]);

  useEffect(() => {
    if (view.status !== "running") {
      return;
    }
    void fetchChildWorkflowRuns({ data: summary.runId }).then(setPageChildRuns);
  }, [summary.runId, view.status, events.length]);

  const [expandedNestedRunIds, setExpandedNestedRunIds] = useState<Set<string>>(() =>
    search.nested ? new Set([search.nested]) : new Set(),
  );
  const [nestedCache, setNestedCache] = useState<Map<string, NestedCacheEntry>>(() => new Map());
  const [nestedMessages, setNestedMessages] = useState<Map<string, Promise<PrefetchedRunMessages>>>(
    () => new Map(),
  );
  const nestedLoadingRef = useRef(new Set<string>());
  const nestedCacheRef = useRef(nestedCache);
  nestedCacheRef.current = nestedCache;

  const selectedNestedRunId = search.nested ?? null;

  // Deep links with ?nested= must expand that nest so step/episode rows are visible.
  useEffect(() => {
    if (!selectedNestedRunId) return;
    setExpandedNestedRunIds((prev) => {
      if (prev.has(selectedNestedRunId)) return prev;
      const next = new Set(prev);
      next.add(selectedNestedRunId);
      return next;
    });
  }, [selectedNestedRunId]);

  const neededNestedIds = useMemo(() => {
    const ids = new Set(expandedNestedRunIds);
    if (selectedNestedRunId) {
      ids.add(selectedNestedRunId);
    }
    return ids;
  }, [expandedNestedRunIds, selectedNestedRunId]);

  // Always commit successful fetches. Cancelling on neededNestedIds churn (another
  // expand/selection) previously discarded in-flight results and left the expand
  // spinner stuck until a later click re-ran this effect.
  useEffect(() => {
    for (const runId of neededNestedIds) {
      if (nestedCacheRef.current.has(runId) || nestedLoadingRef.current.has(runId)) continue;
      nestedLoadingRef.current.add(runId);
      void (async () => {
        try {
          const [data, children] = await Promise.all([
            fetchWorkflowRun({ data: runId }),
            fetchChildWorkflowRuns({ data: runId }),
          ]);
          if (!data) return;
          setNestedCache((prev) => {
            if (prev.has(runId)) return prev;
            const next = new Map(prev);
            next.set(runId, {
              summary: data.summary,
              events: data.events,
              childRuns: children,
            });
            return next;
          });
        } finally {
          nestedLoadingRef.current.delete(runId);
        }
      })();
    }
  }, [neededNestedIds]);

  const nestedByRunId = useMemo(() => {
    const map = new Map<string, NestedRunTreeData>();
    for (const [runId, entry] of nestedCache) {
      map.set(runId, {
        run: entry.summary,
        view: buildRunViewState(runId, entry.events),
        childRuns: entry.childRuns,
      });
    }
    return map;
  }, [nestedCache]);

  // Parent (and expanded nest) SSE does not carry child workflow_started rows — poll
  // listRuns while any watched run is still live so new nests appear in the tree.
  const liveChildParentsKey = useMemo(() => {
    const parents: string[] = [];
    if (view.status === "running" && !offline) {
      parents.push(summary.runId);
    }
    for (const runId of neededNestedIds) {
      const nestedView = nestedByRunId.get(runId)?.view;
      const status = nestedView?.status ?? nestedCache.get(runId)?.summary.status;
      if (status === "running" && !offline) {
        parents.push(runId);
      }
    }
    return [...new Set(parents)].sort().join("\0");
  }, [view.status, offline, summary.runId, neededNestedIds, nestedByRunId, nestedCache]);

  const liveChildParentsRef = useRef<string[]>([]);
  liveChildParentsRef.current = liveChildParentsKey ? liveChildParentsKey.split("\0") : [];

  useEffect(() => {
    if (!liveChildParentsKey) return;
    let cancelled = false;

    const refresh = async () => {
      const parents = liveChildParentsRef.current;
      const results = await Promise.all(
        parents.map(async (parentId) => ({
          parentId,
          children: await fetchChildWorkflowRuns({ data: parentId }),
        })),
      );
      if (cancelled) return;
      for (const { parentId, children } of results) {
        if (parentId === summary.runId) {
          setPageChildRuns((prev) => (childRunListsEqual(prev, children) ? prev : children));
          continue;
        }
        setNestedCache((prev) => {
          const entry = prev.get(parentId);
          if (!entry) return prev;
          if (childRunListsEqual(entry.childRuns, children)) return prev;
          const next = new Map(prev);
          next.set(parentId, { ...entry, childRuns: children });
          return next;
        });
      }
    };

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveChildParentsKey, summary.runId]);

  // Catch children that finish (or start) in the last moment before the run leaves "running".
  useEffect(() => {
    if (view.status === "running") return;
    let cancelled = false;
    void fetchChildWorkflowRuns({ data: summary.runId }).then((children) => {
      if (cancelled) return;
      setPageChildRuns((prev) => (childRunListsEqual(prev, children) ? prev : children));
    });
    return () => {
      cancelled = true;
    };
  }, [view.status, summary.runId]);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(() => {
    if (search.nested) {
      return search.step ?? null;
    }
    if (!search.step && !search.episode) return null;
    return resolveRunSelection(view.steps, {
      stepId: search.step,
      episodeId: search.episode,
    }).stepId;
  });
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(() => {
    if (search.nested) {
      return search.episode ?? null;
    }
    if (!search.step && !search.episode) return null;
    return resolveRunSelection(view.steps, {
      stepId: search.step,
      episodeId: search.episode,
    }).episodeId;
  });
  const [selectedOwnerRunId, setSelectedOwnerRunId] = useState<string>(
    () => search.nested ?? summary.runId,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (search.nested && !search.step && !search.episode) {
      setSelectedStepId(null);
      setSelectedEpisodeId(null);
      setSelectedOwnerRunId(search.nested);
      return;
    }
    if (!search.step && !search.episode) {
      setSelectedStepId(null);
      setSelectedEpisodeId(null);
      setSelectedOwnerRunId(summary.runId);
      return;
    }
    const ownerId = search.nested ?? summary.runId;
    // Never fall back to the page run's steps when resolving a nested selection —
    // wait until the nested view is loaded.
    const ownerSteps =
      ownerId === summary.runId ? view.steps : (nestedByRunId.get(ownerId)?.view?.steps ?? []);
    if (search.episode) {
      const found = findEpisodeInTree(ownerSteps, search.episode);
      setSelectedStepId(found?.step.stepId ?? search.step ?? null);
      setSelectedEpisodeId(search.episode);
      setSelectedOwnerRunId(ownerId);
      return;
    }
    if (ownerId !== summary.runId && ownerSteps.length === 0) {
      // Nested view not loaded yet — keep URL step id without parent-tree fallback.
      setSelectedStepId(search.step ?? null);
      setSelectedEpisodeId(null);
      setSelectedOwnerRunId(ownerId);
      return;
    }
    setSelectedStepId(search.step ?? null);
    setSelectedEpisodeId(null);
    setSelectedOwnerRunId(ownerId);
  }, [search.episode, search.step, search.nested, view, nestedByRunId, summary.runId]);

  const ownerView: RunViewState =
    selectedOwnerRunId === summary.runId
      ? view
      : (nestedByRunId.get(selectedOwnerRunId)?.view ?? view);
  const ownerSummary: InspectorRunSummary =
    selectedOwnerRunId === summary.runId
      ? summary
      : (nestedCache.get(selectedOwnerRunId)?.summary ?? summary);
  const ownerEvents: RunEvent[] =
    selectedOwnerRunId === summary.runId
      ? events
      : (nestedCache.get(selectedOwnerRunId)?.events ?? events);

  const selectedStep = selectedStepId ? findStepInTree(ownerView.steps, selectedStepId) : undefined;
  const activeEpisode = selectedEpisodeId
    ? (selectedStep?.agentEpisodes.find((e) => e.episodeId === selectedEpisodeId) ?? null)
    : null;

  const streamingText = activeEpisode?.status === "running" ? activeEpisode.streamingText : null;
  const canRetry = !offline && view.status !== "running" && ownerView.steps.length > 0;

  const workflowSelected =
    selectedStepId === null && selectedEpisodeId === null && selectedNestedRunId === null;
  const nestedRunSelected =
    selectedNestedRunId !== null && selectedStepId === null && selectedEpisodeId === null;

  const inspectorView = nestedRunSelected
    ? (nestedByRunId.get(selectedNestedRunId!)?.view ?? null)
    : ownerView;
  const inspectorSummary = nestedRunSelected
    ? (nestedCache.get(selectedNestedRunId!)?.summary ?? null)
    : ownerSummary;
  const inspectorEvents = nestedRunSelected
    ? (nestedCache.get(selectedNestedRunId!)?.events ?? [])
    : ownerEvents;
  const inspectorLoading = nestedRunSelected && inspectorView === null;

  const messagesRunId = nestedRunSelected
    ? selectedNestedRunId!
    : selectedOwnerRunId === summary.runId
      ? summary.runId
      : selectedOwnerRunId;

  useEffect(() => {
    if (messagesRunId === summary.runId) return;
    if (nestedMessages.has(messagesRunId)) return;
    const promise = fetchMessagesForWorkflowRun({ data: messagesRunId });
    setNestedMessages((prev) => {
      if (prev.has(messagesRunId)) return prev;
      const next = new Map(prev);
      next.set(messagesRunId, promise);
      return next;
    });
  }, [messagesRunId, summary.runId, nestedMessages]);

  const activeMessagesPromise =
    messagesRunId === summary.runId
      ? messagesPromise
      : (nestedMessages.get(messagesRunId) ?? messagesPromise);

  function setRunSearch(selection: {
    step?: string | null;
    episode?: string | null;
    nested?: string | null;
  }) {
    void navigate({
      search: () => workflowRunSearch(selection),
      replace: true,
      resetScroll: false,
    });
  }

  function handleSelectWorkflow() {
    setSelectedStepId(null);
    setSelectedEpisodeId(null);
    setSelectedOwnerRunId(summary.runId);
    setRunSearch({});
  }

  function handleSelectStep(stepId: string, ownerRunId: string) {
    setSelectedStepId(stepId);
    setSelectedEpisodeId(null);
    setSelectedOwnerRunId(ownerRunId);
    setRunSearch({
      step: stepId,
      nested: ownerRunId === summary.runId ? null : ownerRunId,
    });
  }

  function handleSelectEpisode(stepId: string, ep: AgentEpisode, ownerRunId: string) {
    setSelectedStepId(stepId);
    setSelectedEpisodeId(ep.episodeId);
    setSelectedOwnerRunId(ownerRunId);
    setRunSearch({
      step: stepId,
      episode: ep.episodeId,
      nested: ownerRunId === summary.runId ? null : ownerRunId,
    });
  }

  function handleSelectNestedRun(runId: string) {
    setSelectedStepId(null);
    setSelectedEpisodeId(null);
    setSelectedOwnerRunId(runId);
    setExpandedNestedRunIds((prev) => {
      if (prev.has(runId)) return prev;
      const next = new Set(prev);
      next.add(runId);
      return next;
    });
    setRunSearch({ nested: runId });
  }

  const handleToggleNestedExpanded = useCallback((runId: string) => {
    setExpandedNestedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const handleNestedEvents = useCallback((runId: string, nextEvents: RunEvent[]) => {
    setNestedCache((prev) => {
      const entry = prev.get(runId);
      if (!entry) return prev;
      if (entry.events === nextEvents) return prev;
      const next = new Map(prev);
      next.set(runId, { ...entry, events: nextEvents });
      return next;
    });
  }, []);

  async function handleRetry(fromStepId?: string | null, ownerRunId?: string) {
    const targetRunId = ownerRunId ?? selectedOwnerRunId;
    const stepsForRetry =
      targetRunId === summary.runId
        ? view.steps
        : (nestedByRunId.get(targetRunId)?.view?.steps ?? ownerView.steps);
    const stepId = resolveRetryStepId(stepsForRetry, fromStepId ?? selectedStepId);
    if (!stepId) {
      setRetryError("No step available to retry from.");
      return;
    }
    setRetryBusy(true);
    setRetryError(null);
    try {
      const result = await retryInspectionWorkflowRun({
        data: { runId: targetRunId, stepId },
      });
      if (result.isErr) {
        setRetryError(result.error);
        return;
      }
      void router.invalidate();
      await navigate({
        to: "/workflows/$workflowId/run/$runId",
        params: {
          workflowId: result.value.workflowId,
          runId: result.value.runId,
        },
      });
    } finally {
      setRetryBusy(false);
    }
  }

  function openNestedRunPage(run: InspectorRunSummary) {
    void navigate({
      to: "/workflows/$workflowId/run/$runId",
      params: { workflowId: run.workflowId, runId: run.runId },
      search: () => ({}),
    });
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      {Array.from(neededNestedIds).map((runId) => {
        const entry = nestedCache.get(runId);
        if (!entry) return null;
        return (
          <NestedRunEventsBridge
            key={runId}
            runId={runId}
            seedEvents={entry.events}
            onEvents={handleNestedEvents}
          />
        );
      })}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/workflows/$workflowId" params={{ workflowId: summary.workflowId }}>
            <ArrowLeft className="size-4" />
            {summary.workflowId}
          </Link>
        </Button>
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              title={summary.runId}
              className={
                runTitle
                  ? "truncate text-sm font-semibold"
                  : "truncate font-mono text-sm font-semibold"
              }
            >
              {workflowRunLabel({ runId: summary.runId, title: runTitle })}
            </h1>
            <RunStatusBadge status={view.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {view.workflowId}
            {view.status === "running" && !offline ? " · live" : ""}
            {view.status === "running" && offline ? " · server stopped" : ""}
          </p>
        </div>
        {view.status === "running" && !offline ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                await cancelInspectionWorkflowRun({ data: summary.runId });
                await router.invalidate();
              })();
            }}
          >
            Cancel
          </Button>
        ) : null}
        {canRetry ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="retry-workflow-run"
            disabled={retryBusy}
            onClick={() => {
              void handleRetry();
            }}
          >
            <RotateCcw className="mr-2 size-4" />
            {retryBusy ? "Retrying…" : "Retry"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => setInspectorOpen((o) => !o)}
        >
          <PanelRight className="mr-2 size-4" />
          {inspectorOpen ? "Hide inspector" : "Show inspector"}
        </Button>
      </header>

      {retryError ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5">
          <span className="text-[10px] font-medium tracking-wide text-destructive uppercase">
            Retry failed
          </span>
          <ErrorIndicator error={retryError} className="min-w-0 flex-1" />
        </div>
      ) : null}

      {view.status === "failed" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5">
          <span className="text-[10px] font-medium tracking-wide text-destructive uppercase">
            Failed
          </span>
          <ErrorIndicator error={view.error ?? "Workflow run failed."} className="min-w-0 flex-1" />
        </div>
      ) : null}

      {view.status === "cancelled" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Cancelled
          </span>
          <p className="truncate text-xs text-muted-foreground">Workflow run cancelled.</p>
        </div>
      ) : null}

      {runWarnings.length > 0 ? (
        <div
          role="status"
          className="shrink-0 space-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5"
        >
          <span className="text-[10px] font-medium tracking-wide text-amber-800 uppercase dark:text-amber-200">
            Warning{runWarnings.length === 1 ? "" : "s"}
          </span>
          {runWarnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-800 dark:text-amber-200" title={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {summary.parentWorkflowRunId ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-xs">
          <span className="text-muted-foreground">Parent</span>
          {parentSummary ? (
            <Link
              to="/workflows/$workflowId/run/$runId"
              params={{ workflowId: parentSummary.workflowId, runId: parentSummary.runId }}
              className="truncate font-medium text-foreground underline-offset-2 hover:underline"
            >
              {parentSummary.title?.trim() || parentSummary.workflowId}
            </Link>
          ) : (
            <span className="text-muted-foreground">Parent run not found</span>
          )}
        </div>
      ) : null}

      <ResizablePanelGroup
        orientation="horizontal"
        id="run-workspace-panels"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="workflow-tree"
          defaultSize={inspectorOpen ? "58%" : "100%"}
          minSize={inspectorOpen ? "28%" : "100%"}
        >
          <WorkflowTreePanel
            view={view}
            childRuns={displayChildRuns}
            nestedByRunId={nestedByRunId}
            expandedNestedRunIds={expandedNestedRunIds}
            selectedStepId={selectedStepId}
            selectedEpisodeId={activeEpisode?.episodeId ?? null}
            selectedNestedRunId={nestedRunSelected ? selectedNestedRunId : null}
            workflowSelected={workflowSelected}
            onSelectWorkflow={handleSelectWorkflow}
            onSelectStep={handleSelectStep}
            onSelectEpisode={handleSelectEpisode}
            onSelectNestedRun={handleSelectNestedRun}
            onToggleNestedExpanded={handleToggleNestedExpanded}
            canRetry={canRetry}
            retryBusy={retryBusy}
            priorAttemptRunId={summary.retriesFromRunId ?? null}
            priorAttemptWorkflowId={summary.workflowId}
            onRetryFromStep={(stepId, ownerRunId) => {
              void handleRetry(stepId, ownerRunId);
            }}
            onRetryWorkflow={() => {
              void handleRetry(resolveRetryStepId(view.steps), summary.runId);
            }}
            onOpenNestedRunPage={openNestedRunPage}
          />
        </ResizablePanel>

        {inspectorOpen ? (
          <>
            <ResizableHandle className="self-stretch" />
            <ResizablePanel
              id="step-inspector"
              defaultSize="42%"
              minSize="24%"
              maxSize="72%"
              className="min-w-0 overflow-hidden"
            >
              <StepInspectorPanel
                step={nestedRunSelected || workflowSelected ? undefined : selectedStep}
                episode={nestedRunSelected || workflowSelected ? null : activeEpisode}
                events={inspectorEvents}
                messagesPromise={activeMessagesPromise}
                streamingText={nestedRunSelected || workflowSelected ? null : streamingText}
                workflowId={
                  nestedRunSelected
                    ? (inspectorSummary?.workflowId ?? view.workflowId)
                    : (inspectorView?.workflowId ?? view.workflowId)
                }
                runId={
                  nestedRunSelected ? selectedNestedRunId! : (inspectorView?.runId ?? view.runId)
                }
                tags={inspectorSummary?.tags ?? summary.tags}
                workflowInput={inspectorView?.input}
                workflowOutput={inspectorView?.output}
                runStatus={inspectorView?.status ?? view.status}
                runError={inspectorView?.error}
                loading={inspectorLoading}
                nestedRunLink={
                  nestedRunSelected && selectedNestedRunId && inspectorSummary
                    ? {
                        workflowId: inspectorSummary.workflowId,
                        runId: selectedNestedRunId,
                      }
                    : null
                }
                canRetry={canRetry}
                retryBusy={retryBusy}
                onRetryFromStep={
                  selectedStep
                    ? () => {
                        void handleRetry(selectedStep.stepId);
                      }
                    : undefined
                }
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

function NestedRunEventsBridge({
  runId,
  seedEvents,
  onEvents,
}: {
  runId: string;
  seedEvents: RunEvent[];
  onEvents: (runId: string, events: RunEvent[]) => void;
}) {
  const seedRef = useRef(seedEvents);
  const events = useWorkflowRunEvents(runId, seedRef.current);
  useEffect(() => {
    onEvents(runId, events);
  }, [runId, events, onEvents]);
  return null;
}

function childRunListsEqual(a: InspectorRunSummary[], b: InspectorRunSummary[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.runId !== right.runId ||
      left.status !== right.status ||
      left.finishedAt !== right.finishedAt ||
      left.title !== right.title ||
      left.parentStepId !== right.parentStepId
    ) {
      return false;
    }
  }
  return true;
}
