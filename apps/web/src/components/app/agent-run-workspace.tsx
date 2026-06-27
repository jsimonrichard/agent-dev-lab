import { useCallback, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, GitBranch, PanelRight } from "lucide-react";

import { fetchMessagesForScope, sendAgentMessage } from "#/lib/inspector-server";
import { useAgentRunEvents } from "@/hooks/use-agent-run-events";
import type {
  MockAgentSettings,
  MockAgentSummary,
  MockMessage,
  ResolvedAgentConversation,
} from "@/lib/mock/types";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { ChatComposer } from "@/components/app/chat-composer";
import { AgentSettingsPanel } from "@/components/app/agent-settings-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface AgentRunWorkspaceProps {
  agent: MockAgentSummary;
  conversation: ResolvedAgentConversation;
  settings: MockAgentSettings;
}

export function AgentRunWorkspace({ agent, conversation, settings }: AgentRunWorkspaceProps) {
  const router = useRouter();
  const forkSession = conversation.forkSession;
  const [messages, setMessages] = useState<MockMessage[]>(() => conversation.messages);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamEnabled, setStreamEnabled] = useState(false);

  const refreshMessages = useCallback(async () => {
    const updated = await fetchMessagesForScope({ data: conversation.runId });
    setMessages(updated);
    void router.invalidate();
  }, [conversation.runId, router]);

  const { streamingText, isRunning } = useAgentRunEvents(conversation.runId, {
    enabled: streamEnabled,
    onFinished: () => {
      void refreshMessages();
    },
  });

  async function handleSend(text: string) {
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: "user", content: text }]);
    try {
      await sendAgentMessage({
        data: {
          agentId: agent.id,
          memoryScope: conversation.runId,
          user: text,
        },
      });
      setStreamEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent run failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{conversation.title}</h1>
            <span className="font-mono text-xs text-muted-foreground">{agent.id}</span>
            {forkSession ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <GitBranch className="size-3" />
                Forked
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{agent.description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <PanelRight className="mr-2 size-4" />
          {settingsOpen ? "Hide settings" : "Show settings"}
        </Button>
        {forkSession ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/workflows/$workflowId/run/$runId"
              params={{
                workflowId: forkSession.sourceWorkflowId,
                runId: forkSession.sourceRunId,
              }}
              className="gap-2"
            >
              <ArrowLeft className="size-4" />
              Source run
            </Link>
          </Button>
        ) : null}
      </header>

      {forkSession ? (
        <div className="shrink-0 border-b border-border/40 bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
          Continued from{" "}
          <span className="font-mono text-foreground">{forkSession.sourceEpisodeId}</span>
          {" · "}
          <span className="font-mono">{forkSession.sourceMemoryScope}</span>
        </div>
      ) : null}

      {error ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
          {!agent.id ? null : (
            <span className="block text-muted-foreground">
              Agent runs require a configured model and API credentials in the project.
            </span>
          )}
        </div>
      ) : null}

      <ResizablePanelGroup
        orientation="horizontal"
        id="agent-conversation-panels"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="agent-chat"
          defaultSize={settingsOpen ? "62%" : "100%"}
          minSize={settingsOpen ? "40%" : "100%"}
        >
          <div className="flex h-full min-h-0 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <ChatMessageList
                messages={messages}
                streamingText={isRunning || sending ? streamingText : null}
              />
            </ScrollArea>
            <ChatComposer
              onSend={(text) => void handleSend(text)}
              disabled={sending || isRunning}
              placeholder={
                forkSession ? `Continue conversation with ${agent.id}…` : `Message ${agent.id}…`
              }
            />
          </div>
        </ResizablePanel>

        {settingsOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel id="agent-settings" defaultSize="38%" minSize="22%" maxSize="50%">
              <AgentSettingsPanel settings={settings} conversation={conversation} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
