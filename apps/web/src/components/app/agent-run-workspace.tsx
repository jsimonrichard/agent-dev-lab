import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Bot, GitBranch, MessageSquare, PanelRight } from "lucide-react";

import type { AgentInspectorMeta } from "#/lib/inspector/inspector-types";
import {
  buildToolProviderContextInput,
  seedToolProviderContextForm,
} from "#/lib/agent/agent-tools";
import {
  fetchAgentCallEvents,
  fetchMessagesForScope,
  forkLinkedConversation,
  sendAgentMessage,
} from "#/lib/inspector/inspector-server";
import { useAgentRunEvents } from "@/hooks/use-agent-run-events";
import type {
  InspectorAgentSummary,
  InspectorMessage,
  JsonValue,
  ResolvedAgentConversation,
} from "@/lib/view-model/types";
import { messageIdsForAgentCall } from "@/lib/agent/agent-call-focus";
import { agentRunSearch } from "@/lib/agent/agent-location";
import { ChatMessageList } from "@/components/app/chat-message-list";
import {
  extractSystemPromptFromMessages,
  mergeConversationMessages,
  reconcileFetchedMessages,
  shouldShowStreamingAssistant,
} from "@/lib/chat-messages";
import { ChatComposer } from "@/components/app/chat-composer";
import { AgentSettingsPanel } from "@/components/app/agent-settings-panel";
import { ErrorDetails } from "@/components/app/error-details";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Separator } from "@/components/ui/separator";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface AgentRunWorkspaceProps {
  agent: InspectorAgentSummary;
  conversation: ResolvedAgentConversation;
  settings: AgentInspectorMeta;
  callId?: string;
}

export function AgentRunWorkspace({
  agent,
  conversation,
  settings,
  callId,
}: AgentRunWorkspaceProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const forkSession = conversation.forkSession;
  const workflowLink = conversation.workflowLink;
  const effectiveCallId = callId ?? conversation.latestAgentCallId ?? undefined;
  const [messages, setMessages] = useState<InspectorMessage[]>(() => conversation.messages);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [sending, setSending] = useState(false);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [callEvents, setCallEvents] = useState<
    Array<{ type: string; total?: number; count?: number }>
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [inspectedToolContext, setInspectedToolContext] = useState<unknown | null | undefined>(
    undefined,
  );
  const [contextValues, setContextValues] = useState<Record<string, string | boolean>>(
    () =>
      seedToolProviderContextForm({
        fields: settings.toolProviderContext.fields,
        sample: settings.toolProviderContext.sample,
        seed: conversation.nextToolProviderContextSeed,
      }).values,
  );
  const [contextJson, setContextJson] = useState(
    () =>
      seedToolProviderContextForm({
        fields: settings.toolProviderContext.fields,
        sample: settings.toolProviderContext.sample,
        seed: conversation.nextToolProviderContextSeed,
      }).rawJson,
  );

  useEffect(() => {
    setMessages(conversation.messages);
    setError(null);
    setSending(false);
    setForking(false);
    setStreamEnabled(false);
    setWarnings([]);
  }, [conversation.runId]);

  useEffect(() => {
    // Only reseed on conversation change — not when invalidate rebuilds seed/settings
    // object identity after a turn or title update (that wiped in-progress edits).
    const seeded = seedToolProviderContextForm({
      fields: settings.toolProviderContext.fields,
      sample: settings.toolProviderContext.sample,
      seed: conversation.nextToolProviderContextSeed,
    });
    setContextValues(seeded.values);
    setContextJson(seeded.rawJson);
  }, [conversation.runId]);

  useEffect(() => {
    if (!effectiveCallId) {
      setCallEvents([]);
      setWarnings([]);
      setInspectedToolContext(undefined);
      return;
    }
    let cancelled = false;
    void fetchAgentCallEvents({ data: effectiveCallId }).then((payload) => {
      if (cancelled) {
        return;
      }
      setCallEvents(payload.commits);
      setWarnings(payload.warnings);
      if (callId && callId === effectiveCallId) {
        setInspectedToolContext(payload.toolProviderContext);
      } else {
        setInspectedToolContext(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [callId, effectiveCallId]);

  useEffect(() => {
    setMessages((current) => mergeConversationMessages(current, conversation.messages));
  }, [conversation.messages]);

  const refreshMessages = useCallback(async () => {
    const updated = await fetchMessagesForScope({ data: conversation.runId });
    setMessages((current) => reconcileFetchedMessages(updated, current));
  }, [conversation.runId]);

  const refreshConversationMeta = useCallback(() => {
    void router.invalidate();
  }, [router]);

  const { streamingText, isRunning } = useAgentRunEvents(conversation.runId, {
    enabled: streamEnabled,
    onFinished: async () => {
      await refreshMessages();
      refreshConversationMeta();
      if (effectiveCallId) {
        const payload = await fetchAgentCallEvents({ data: effectiveCallId });
        setCallEvents(payload.commits);
        setWarnings(payload.warnings);
        if (callId && callId === effectiveCallId) {
          setInspectedToolContext(payload.toolProviderContext);
        }
      }
    },
    onTitleSet: refreshConversationMeta,
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    },
  });

  const showStreamingAssistant = shouldShowStreamingAssistant(messages, streamingText, {
    isRunning,
  });
  const focusStreaming = Boolean(
    callId && showStreamingAssistant && conversation.latestAgentCallId === callId,
  );
  const focusMessageIds = useMemo(() => {
    if (!callId) {
      return undefined;
    }
    const ids = messageIdsForAgentCall(messages, callEvents, {
      fallbackToLast: conversation.latestAgentCallId === callId,
    });
    return ids.length > 0 ? new Set(ids) : undefined;
  }, [callEvents, callId, conversation.latestAgentCallId, messages]);

  const episodeToolContext = useMemo(() => {
    if (callId) {
      if (inspectedToolContext === undefined) {
        return undefined;
      }
      return {
        value: inspectedToolContext,
        onCopyToNextTurn:
          workflowLink || inspectedToolContext === null
            ? undefined
            : () => {
                const seeded = seedToolProviderContextForm({
                  fields: settings.toolProviderContext.fields,
                  sample: settings.toolProviderContext.sample,
                  seed: inspectedToolContext as JsonValue,
                });
                setContextValues(seeded.values);
                setContextJson(seeded.rawJson);
                setSettingsOpen(true);
              },
      };
    }
    if (workflowLink) {
      return {
        value:
          conversation.latestEpisodeToolProviderContext !== undefined
            ? conversation.latestEpisodeToolProviderContext
            : null,
      };
    }
    return undefined;
  }, [
    callId,
    conversation.latestEpisodeToolProviderContext,
    inspectedToolContext,
    settings.toolProviderContext.fields,
    settings.toolProviderContext.sample,
    workflowLink,
  ]);

  function viewToolContextForCall(agentCallId: string) {
    setSettingsOpen(true);
    void navigate({
      to: "/agent/$agentId/run/$runId",
      params: { agentId: agent.id, runId: conversation.runId },
      search: agentRunSearch({ call: agentCallId }),
    });
  }

  async function handleSend(text: string) {
    setSending(true);
    setError(null);
    setStreamEnabled(false);
    let toolProviderContext: unknown;
    try {
      toolProviderContext = buildToolProviderContextInput({
        declared: settings.toolProviderContext.declared,
        fields: settings.toolProviderContext.fields,
        values: contextValues,
        rawJson: contextJson,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSending(false);
      return;
    }
    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: "user", content: text, parts: [{ type: "text", text }] },
    ]);
    const result = await sendAgentMessage({
      data: {
        agentId: agent.id,
        memoryScope: conversation.runId,
        user: text,
        ...(toolProviderContext !== undefined ? { toolProviderContext } : {}),
      },
    });
    if (result.isErr) {
      setMessages((prev) => prev.filter((message) => message.id !== pendingId));
      setError(result.error);
      setSending(false);
      return;
    }
    setStreamEnabled(true);
    setSending(false);
  }

  async function handleFork() {
    setForking(true);
    setError(null);
    const result = await forkLinkedConversation({
      data: { memoryScope: conversation.runId, agentId: agent.id },
    });
    if (result.isErr) {
      setError(result.error);
      setForking(false);
      return;
    }
    await router.invalidate();
    void navigate({
      to: "/agent/$agentId/run/$runId",
      params: { agentId: agent.id, runId: result.value.memoryScope },
    });
    setForking(false);
  }

  const storedSystemPrompt = extractSystemPromptFromMessages(messages);
  const viewToolContextCallId = callId ?? conversation.latestAgentCallId;

  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
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
                Workflow Run
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
      {warnings.length > 0 ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2"
        >
          {warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-800 dark:text-amber-200" title={warning}>
              {warning}
            </p>
          ))}
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
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="min-h-full">
                    <ChatMessageList
                      messages={messages}
                      streamingText={showStreamingAssistant ? streamingText : null}
                      isStreaming={isRunning || sending}
                      systemPrompt={storedSystemPrompt ? null : settings.systemPrompt}
                      focusMessageIds={focusMessageIds}
                      focusStreaming={focusStreaming}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    disabled={!viewToolContextCallId}
                    onSelect={() => {
                      if (viewToolContextCallId) {
                        viewToolContextForCall(viewToolContextCallId);
                      }
                    }}
                  >
                    View tool context
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </ScrollArea>
            {workflowLink ? (
              <div className="flex shrink-0 flex-col items-center gap-3 border-t border-border/40 bg-background p-4">
                <p className="text-center text-sm text-muted-foreground">
                  Read-only. This conversation is part of a workflow run.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={forking}
                  onClick={() => void handleFork()}
                >
                  <GitBranch className="size-4" />
                  {forking ? "Forking…" : "Fork conversation"}
                </Button>
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
            <ResizableHandle />
            <ResizablePanel id="agent-settings" defaultSize="38%" minSize="22%" maxSize="50%">
              <AgentSettingsPanel
                settings={settings}
                conversation={conversation}
                episodeToolContext={episodeToolContext}
                contextForm={
                  workflowLink
                    ? undefined
                    : {
                        values: contextValues,
                        rawJson: contextJson,
                        onValuesChange: setContextValues,
                        onRawJsonChange: setContextJson,
                      }
                }
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
