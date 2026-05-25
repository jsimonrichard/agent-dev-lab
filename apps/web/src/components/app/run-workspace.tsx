import { useMemo, useState } from "react";
import { PanelRight } from "lucide-react";
import { getMockRunEvents, mockConversations } from "@/lib/mock/data";
import { buildRunViewState, findStepInTree } from "@/lib/mock/run-projection";
import type { AgentEpisode, MockRunSummary } from "@/lib/mock/types";
import { RunStatusBadge } from "@/components/app/run-status-badge";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { ChatComposer } from "@/components/app/chat-composer";
import { StepTracePanel } from "@/components/app/step-trace-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RunWorkspaceProps {
  summary: MockRunSummary;
}

export function RunWorkspace({ summary }: RunWorkspaceProps) {
  const events = getMockRunEvents(summary.runId);
  const view = useMemo(() => buildRunViewState(summary.runId, events), [summary.runId, events]);

  const initialStep = findFirstEpisodeStep(view.steps) ?? view.steps[0];
  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialStep?.stepId ?? null);
  const [selectedEpisode, setSelectedEpisode] = useState<AgentEpisode | null>(
    initialStep?.agentEpisodes[initialStep.agentEpisodes.length - 1] ?? null,
  );
  const [traceOpen, setTraceOpen] = useState(true);
  const [extraMessages, setExtraMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string }[]
  >([]);

  const selectedStep = selectedStepId ? findStepInTree(view.steps, selectedStepId) : undefined;

  const activeEpisode =
    selectedEpisode ?? selectedStep?.agentEpisodes[selectedStep.agentEpisodes.length - 1] ?? null;

  const baseConversation = activeEpisode ? mockConversations[activeEpisode.memoryScope] : undefined;

  const messages = [...(baseConversation?.messages ?? []), ...extraMessages];

  const streamingText = activeEpisode?.status === "running" ? activeEpisode.streamingText : null;

  function handleSelectStep(stepId: string) {
    setSelectedStepId(stepId);
    const step = findStepInTree(view.steps, stepId);
    const ep = step?.agentEpisodes[step.agentEpisodes.length - 1];
    if (ep) setSelectedEpisode(ep);
  }

  function handleSelectEpisode(ep: AgentEpisode) {
    setSelectedEpisode(ep);
  }

  function handleSend(text: string) {
    setExtraMessages((prev) => [
      ...prev,
      { id: `u-${prev.length}`, role: "user", content: text },
      {
        id: `a-${prev.length}`,
        role: "assistant",
        content: `[Mock] Agent reply for ${activeEpisode?.agentId ?? "agent"}: ${text}`,
      },
    ]);
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
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
          onClick={() => setTraceOpen((o) => !o)}
        >
          <PanelRight className="mr-2 size-4" />
          {traceOpen ? "Hide trace" : "Show trace"}
        </Button>
      </header>

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={traceOpen ? 68 : 100} minSize={45}>
          <div className="flex h-full min-h-0 flex-col bg-background">
            {activeEpisode ? (
              <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{activeEpisode.agentId}</span>
                <span className="mx-2">·</span>
                <span className="font-mono">{activeEpisode.memoryScope}</span>
              </div>
            ) : null}
            <ScrollArea className="flex-1">
              <ChatMessageList messages={messages} streamingText={streamingText} />
            </ScrollArea>
            <ChatComposer
              onSend={handleSend}
              disabled={!activeEpisode}
              placeholder={
                activeEpisode
                  ? `Message ${activeEpisode.agentId}…`
                  : "Select an agent episode in the trace panel"
              }
            />
          </div>
        </ResizablePanel>

        {traceOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={22} maxSize={45}>
              <StepTracePanel
                steps={view.steps}
                selectedStepId={selectedStepId}
                selectedEpisodeId={activeEpisode?.episodeId ?? null}
                onSelectStep={handleSelectStep}
                onSelectEpisode={handleSelectEpisode}
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
