import { useEffect, useMemo, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PanelRight } from "lucide-react";

import { cancelInspectionWorkflowRun } from "#/lib/inspector/inspector-server";
import {
  buildRunViewState,
  findEpisodeInTree,
  findStepInTree,
  resolveRunSelection,
} from "@/lib/view-model/run-projection";
import type {
  AgentEpisode,
  InspectorRunSummary,
  PrefetchedRunMessages,
  RunEvent,
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

const runRoute = getRouteApi("/_app/workflows/$workflowId/run/$runId");

interface RunWorkspaceProps {
  summary: InspectorRunSummary;
  initialEvents: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
}

export function RunWorkspace({ summary, initialEvents, messagesPromise }: RunWorkspaceProps) {
  const search = runRoute.useSearch();
  const navigate = useNavigate({ from: "/workflows/$workflowId/run/$runId" });
  const events = useWorkflowRunEvents(summary.runId, initialEvents);
  const view = useMemo(() => buildRunViewState(summary.runId, events), [summary.runId, events]);
  const runTitle = view.title ?? summary.title;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    () =>
      resolveRunSelection(view.steps, {
        stepId: search.step,
        episodeId: search.episode,
      }).stepId,
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    () =>
      resolveRunSelection(view.steps, {
        stepId: search.step,
        episodeId: search.episode,
      }).episodeId,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);

  useEffect(() => {
    if (!search.step && !search.episode) {
      return;
    }
    if (search.episode) {
      const found = findEpisodeInTree(view.steps, search.episode);
      setSelectedStepId(found?.step.stepId ?? search.step ?? null);
      setSelectedEpisodeId(search.episode);
      return;
    }
    setSelectedStepId(search.step ?? null);
    setSelectedEpisodeId(null);
  }, [search.episode, search.step, view.steps]);

  const selectedStep = selectedStepId ? findStepInTree(view.steps, selectedStepId) : undefined;
  const activeEpisode = selectedEpisodeId
    ? (selectedStep?.agentEpisodes.find((e) => e.episodeId === selectedEpisodeId) ?? null)
    : null;

  const streamingText = activeEpisode?.status === "running" ? activeEpisode.streamingText : null;

  function setRunSearch(selection: { step?: string | null; episode?: string | null }) {
    void navigate({
      search: () => workflowRunSearch(selection),
      replace: true,
      resetScroll: false,
    });
  }

  function handleSelectWorkflow() {
    setSelectedStepId(null);
    setSelectedEpisodeId(null);
    setRunSearch({});
  }

  function handleSelectStep(stepId: string) {
    setSelectedStepId(stepId);
    setSelectedEpisodeId(null);
    setRunSearch({ step: stepId });
  }

  function handleSelectEpisode(stepId: string, ep: AgentEpisode) {
    setSelectedStepId(stepId);
    setSelectedEpisodeId(ep.episodeId);
    setRunSearch({ step: stepId, episode: ep.episodeId });
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
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
            {view.status === "running" ? " · live" : ""}
          </p>
        </div>
        {view.status === "running" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void cancelInspectionWorkflowRun({ data: summary.runId });
            }}
          >
            Cancel
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

      {view.status === "failed" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5">
          <span className="text-[10px] font-medium tracking-wide text-destructive uppercase">
            Failed
          </span>
          <ErrorIndicator error={view.error ?? "Workflow run failed."} className="min-w-0 flex-1" />
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
            selectedStepId={selectedStepId}
            selectedEpisodeId={activeEpisode?.episodeId ?? null}
            workflowSelected={selectedStepId === null}
            onSelectWorkflow={handleSelectWorkflow}
            onSelectStep={handleSelectStep}
            onSelectEpisode={handleSelectEpisode}
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
                step={selectedStep}
                episode={activeEpisode}
                events={events}
                messagesPromise={messagesPromise}
                streamingText={streamingText}
                workflowId={view.workflowId}
                runId={view.runId}
                workflowInput={view.input}
                workflowOutput={view.output}
                runStatus={view.status}
                runError={view.error}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
