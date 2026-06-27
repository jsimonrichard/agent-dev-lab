import { GitBranch, MessageSquare, Wrench } from "lucide-react";
import type { AgentEpisode, EpisodeArtifacts, MockMessage } from "@/lib/mock/types";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { EpisodeArtifactsView } from "@/components/app/episode-artifacts-view";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStepLabel } from "@/lib/mock/run-projection";
import type { StepNode } from "@/lib/mock/types";

interface StepInspectorPanelProps {
  step: StepNode | undefined;
  episode: AgentEpisode | null;
  messages: MockMessage[];
  streamingText: string | null;
  artifacts: EpisodeArtifacts | undefined;
  onFork: () => void;
}

export function StepInspectorPanel({
  step,
  episode,
  messages,
  streamingText,
  artifacts,
  onFork,
}: StepInspectorPanelProps) {
  if (!step) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-border/40 bg-muted/10 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a step in the workflow tree to view its conversation and artifacts.
        </p>
      </div>
    );
  }

  const stepLabel = formatStepLabel(step.name, step.key);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border/40 bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
        <p className="truncate font-mono text-xs font-semibold">{stepLabel}</p>
        {episode ? (
          <p className="truncate text-[10px] text-muted-foreground">{episode.agentId}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">No agent episode on this step</p>
        )}
      </div>

      {!episode ? (
        <div className="flex flex-1 flex-col p-3">
          {step.output !== undefined ? (
            <pre className="overflow-auto rounded-md border border-border/40 bg-card p-2 font-mono text-[10px]">
              {JSON.stringify(step.output, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">This step has no agent activity.</p>
          )}
        </div>
      ) : (
        <Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2 h-8 w-auto shrink-0">
            <TabsTrigger value="conversation" className="gap-1 text-xs px-2">
              <MessageSquare className="size-3" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1 text-xs px-2">
              <Wrench className="size-3" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="output" className="gap-1 text-xs px-2">
              Output
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conversation" className="mt-0 flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <ChatMessageList
                messages={messages}
                streamingText={streamingText}
                compact
                className="gap-2 p-2"
              />
            </ScrollArea>
            <div className="shrink-0 space-y-2 border-t border-border/40 p-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Read-only in workflow context. Fork to continue in a standalone agent run.
              </p>
              <Button size="sm" className="w-full gap-2" variant="secondary" onClick={onFork}>
                <GitBranch className="size-3.5" />
                Fork to agent run
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tools" className="mt-0 min-h-0 flex-1">
            <EpisodeArtifactsView artifacts={artifacts} />
          </TabsContent>

          <TabsContent value="output" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
            {artifacts?.structuredOutput ? (
              <pre className="overflow-auto rounded-md border border-border/40 bg-card p-3 font-mono text-[11px]">
                {JSON.stringify(artifacts.structuredOutput, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">No structured output on this episode.</p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
