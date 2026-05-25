import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PanelRight } from "lucide-react";
import { getEpisodeArtifacts, getMockRunEvents, mockConversations } from "@/lib/mock/data";
import { createForkedSession } from "@/lib/mock/agent-conversations";
import { buildRunViewState, findStepInTree } from "@/lib/mock/run-projection";
import type { AgentEpisode, MockRunSummary } from "@/lib/mock/types";
import { RunStatusBadge } from "@/components/app/run-status-badge";
import { WorkflowTreePanel } from "@/components/app/workflow-tree-panel";
import { StepInspectorPanel } from "@/components/app/step-inspector-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface RunWorkspaceProps {
  summary: MockRunSummary;
}

export function RunWorkspace({ summary }: RunWorkspaceProps) {
  const navigate = useNavigate();
  const events = getMockRunEvents(summary.runId);
  const view = useMemo(() => buildRunViewState(summary.runId, events), [summary.runId, events]);

  const initialStep = findFirstEpisodeStep(view.steps) ?? view.steps[0];
  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialStep?.stepId ?? null);
  const [selectedEpisode, setSelectedEpisode] = useState<AgentEpisode | null>(
    initialStep?.agentEpisodes[initialStep.agentEpisodes.length - 1] ?? null,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const selectedStep = selectedStepId ? findStepInTree(view.steps, selectedStepId) : undefined;

  const activeEpisode =
    selectedEpisode ?? selectedStep?.agentEpisodes[selectedStep.agentEpisodes.length - 1] ?? null;

  const baseConversation = activeEpisode ? mockConversations[activeEpisode.memoryScope] : undefined;
  const messages = baseConversation?.messages ?? [];
  const streamingText = activeEpisode?.status === "running" ? activeEpisode.streamingText : null;
  const artifacts = activeEpisode ? getEpisodeArtifacts(activeEpisode.episodeId) : undefined;

  function handleSelectStep(stepId: string) {
    setSelectedStepId(stepId);
    const step = findStepInTree(view.steps, stepId);
    const ep = step?.agentEpisodes[step.agentEpisodes.length - 1];
    if (ep) setSelectedEpisode(ep);
  }

  function handleSelectEpisode(ep: AgentEpisode) {
    setSelectedEpisode(ep);
  }

  function handleFork() {
    if (!activeEpisode || !selectedStepId) return;
    const session = createForkedSession({
      agentId: activeEpisode.agentId,
      sourceRunId: summary.runId,
      sourceStepId: selectedStepId,
      sourceEpisodeId: activeEpisode.episodeId,
      sourceMemoryScope: activeEpisode.memoryScope,
      messages,
    });
    void navigate({
      to: "/agents/$conversationId",
      params: { conversationId: session.forkId },
    });
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-mono text-sm font-semibold">{summary.runId}</h1>
            <RunStatusBadge status={view.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {view.workflowId}
            {summary.status === "running" ? " · live (mock SSE)" : ""}
          </p>
        </div>
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
            onSelectStep={handleSelectStep}
            onSelectEpisode={handleSelectEpisode}
          />
        </ResizablePanel>

        {inspectorOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel id="step-inspector" defaultSize="42%" minSize="24%" maxSize="72%">
              <StepInspectorPanel
                step={selectedStep}
                episode={activeEpisode}
                messages={messages}
                streamingText={streamingText}
                artifacts={artifacts}
                onFork={handleFork}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

function findFirstEpisodeStep(
  steps: ReturnType<typeof buildRunViewState>["steps"],
): (typeof steps)[number] | undefined {
  for (const step of steps) {
    if (step.agentEpisodes.length > 0) return step;
    const nested = findFirstEpisodeStep(step.children);
    if (nested) return nested;
  }
  return undefined;
}
