import { useCallback, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Bot, GitBranch, MessageSquare, PanelRight } from "lucide-react";

import {
  fetchMessagesForScope,
  forkLinkedConversation,
  sendAgentMessage,
} from "#/lib/inspector-server";
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
import { ErrorDetails } from "@/components/app/error-details";
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
  const navigate = useNavigate();
  const forkSession = conversation.forkSession;
  const workflowLink = conversation.workflowLink;
  const [messages, setMessages] = useState<MockMessage[]>(() => conversation.messages);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [forking, setForking] = useState(false);
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

  async function handleFork() {
    if (!workflowLink || forking) {
      return;
    }
    setForking(true);
    setError(null);
    try {
      const { memoryScope } = await forkLinkedConversation({
        data: conversation.runId,
      });
      await router.invalidate();
      await navigate({
        to: "/agent/$agentId/run/$runId",
        params: { agentId: agent.id, runId: memoryScope },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fork failed");
      setForking(false);
    }
  }

  async function handleSend(text: string) {
    setSending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `pending-${Date.now()}`, role: "user", content: text, parts: [{ type: "text", text }] },
    ]);
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
        <Button variant="ghost" size="sm" asChild>
          <Link to="/agent/$agentId" params={{ agentId: agent.id }}>
            <ArrowLeft className="size-4" />
            <Bot className="size-3.5" />
            {agent.id}
          </Link>
        </Button>
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-sm font-semibold">{conversation.title}</h1>
            {forkSession ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <GitBranch className="size-3" />
                Forked
              </Badge>
            ) : null}
            {workflowLink ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <GitBranch className="size-3" />
                Workflow run
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
              to="/agent/$agentId/run/$runId"
              params={{
                agentId: forkSession.agentId,
                runId: forkSession.sourceMemoryScope,
              }}
              className="gap-2"
            >
              <MessageSquare className="size-4" />
              Forked from
            </Link>
          </Button>
        ) : null}
        {workflowLink ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/workflows/$workflowId/run/$runId"
              params={{
                workflowId: workflowLink.workflowId,
                runId: workflowLink.workflowRunId,
              }}
              search={{
                ...(workflowLink.stepId ? { step: workflowLink.stepId } : {}),
                episode: workflowLink.episodeId,
              }}
              className="gap-2"
            >
              <GitBranch className="size-4" />
              View in Workflow
            </Link>
          </Button>
        ) : null}
      </header>

      {error ? (
        <div className="shrink-0 px-4 py-2">
          <ErrorDetails error={error} compact />
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
            {workflowLink ? (
              <div className="shrink-0 border-t border-border/40 bg-background p-4">
                <div className="mx-auto flex max-w-lg flex-col items-stretch gap-3">
                  <p className="text-center text-sm text-muted-foreground">
                    Read-only in workflow context. Fork to continue in a standalone agent run.
                  </p>
                  <Button
                    size="lg"
                    className="h-12 w-full gap-2 text-base"
                    disabled={forking}
                    onClick={() => void handleFork()}
                  >
                    <GitBranch className="size-5" />
                    {forking ? "Forking…" : "Fork to agent run"}
                  </Button>
                </div>
              </div>
            ) : (
              <ChatComposer
                onSend={(text) => void handleSend(text)}
                disabled={sending || isRunning}
                placeholder={
                  forkSession ? `Continue conversation with ${agent.id}…` : `Message ${agent.id}…`
                }
              />
            )}
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
