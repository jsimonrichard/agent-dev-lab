import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, GitBranch } from "lucide-react";
import type { ForkedAgentSession, MockAgentSummary, MockMessage } from "@/lib/mock/types";
import { appendForkMessage, getForkedSession } from "@/lib/mock/fork-sessions";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { ChatComposer } from "@/components/app/chat-composer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface AgentRunWorkspaceProps {
  agent: MockAgentSummary;
  forkSession: ForkedAgentSession | null;
}

export function AgentRunWorkspace({ agent, forkSession }: AgentRunWorkspaceProps) {
  const [messages, setMessages] = useState<MockMessage[]>(() =>
    forkSession ? (getForkedSession(forkSession.forkId)?.messages ?? forkSession.messages) : [],
  );

  function handleSend(text: string) {
    const userMsg: MockMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantMsg: MockMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: `[Mock] ${agent.id} reply: ${text}`,
    };

    if (forkSession) {
      appendForkMessage(forkSession.forkId, userMsg);
      appendForkMessage(forkSession.forkId, assistantMsg);
      setMessages(getForkedSession(forkSession.forkId)?.messages ?? []);
    } else {
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
    }
  }

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-mono text-sm font-semibold">{agent.id}</h1>
            {forkSession ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <GitBranch className="size-3" />
                Forked
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{agent.description}</p>
        </div>
        {forkSession ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/runs/$runId" params={{ runId: forkSession.sourceRunId }} className="gap-2">
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

      <ScrollArea className="min-h-0 flex-1">
        <ChatMessageList messages={messages} streamingText={null} />
      </ScrollArea>

      <ChatComposer
        onSend={handleSend}
        placeholder={
          forkSession ? `Continue conversation with ${agent.id}…` : `Message ${agent.id}…`
        }
      />
    </div>
  );
}
