import { Await, CatchBoundary, Link } from "@tanstack/react-router";
import { Bot, GitBranch, Layers, MessageSquare } from "lucide-react";

import type {
  AgentEpisode,
  MockMessage,
  PrefetchedRunMessages,
  RunEvent,
  RunStatus,
  StepNode,
} from "@/lib/mock/types";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { ConversationSkeleton } from "@/components/app/conversation-skeleton";
import { ErrorDetails, ErrorIndicator } from "@/components/app/error-details";
import { JsonPreview } from "@/components/app/json-preview";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatStepLabel } from "@/lib/mock/run-projection";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";
import { InspectorNoun } from "@/components/app/inspector-noun";
import { useLiveRunMessages } from "@/hooks/use-live-run-messages";

interface StepInspectorPanelProps {
  step: StepNode | undefined;
  episode: AgentEpisode | null;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  workflowId: string;
  runId: string;
  workflowInput: unknown;
  workflowOutput: unknown;
  runStatus: RunStatus;
  runError?: unknown;
  onFork: (messages: MockMessage[]) => void;
}

export function StepInspectorPanel({
  step,
  episode,
  events,
  messagesPromise,
  streamingText,
  workflowId,
  runId,
  workflowInput,
  workflowOutput,
  runStatus,
  runError,
  onFork,
}: StepInspectorPanelProps) {
  if (!step) {
    return (
      <WorkflowInspector
        workflowId={workflowId}
        input={workflowInput}
        output={workflowOutput}
        status={runStatus}
        error={runError}
      />
    );
  }

  const stepLabel = formatStepLabel(step.name, step.key);
  const stepError = step.error ?? (step.status === "failed" ? runError : undefined);
  const episodeError = episode?.error ?? (episode?.status === "failed" ? stepError : undefined);
  const runSettled = runStatus !== "running";
  const showFullErrorInConversation = Boolean(episodeError);
  const outputEmpty =
    step.status === "running"
      ? "Step in progress…"
      : step.status === "failed"
        ? "Step failed with no recorded output."
        : "No output recorded for this step.";
  const outputError =
    showFullErrorInConversation && stepError ? (
      <ErrorIndicator error={stepError} />
    ) : stepError ? (
      <ErrorDetails error={stepError} compact />
    ) : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border/40 bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
          <Layers className="size-3.5 shrink-0 text-muted-foreground" />
          {stepLabel}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {step.agentEpisodes.length === 0
            ? "No agent conversation on this step"
            : `${step.agentEpisodes.length} conversation${step.agentEpisodes.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="shrink-0 space-y-2 border-b border-border/40 p-3">
        {step.output !== undefined || !stepError ? (
          <JsonPreview
            label="Step output"
            value={step.output}
            empty={outputEmpty}
            className="max-h-40 bg-card/80"
          >
            {outputError}
          </JsonPreview>
        ) : (
          <>
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Step output
            </p>
            {outputError}
          </>
        )}
      </div>

      <ConversationPanel
        step={step}
        episode={episode}
        events={events}
        messagesPromise={messagesPromise}
        streamingText={streamingText}
        episodeError={episodeError}
        runSettled={runSettled}
        runId={runId}
        onFork={onFork}
      />
    </div>
  );
}

function ConversationPanel({
  step,
  episode,
  events,
  messagesPromise,
  streamingText,
  episodeError,
  runSettled,
  runId,
  onFork,
}: {
  step: StepNode;
  episode: AgentEpisode | null;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  episodeError: unknown;
  runSettled: boolean;
  runId: string;
  onFork: (messages: MockMessage[]) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-border/40 px-3 py-2.5">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Agent conversation
        </p>
        {episode ? (
          <div className="space-y-2">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Link
                to="/agent/$agentId/run/$runId"
                params={{ agentId: episode.agentId, runId: episode.memoryScope }}
                className="group max-w-full min-w-0"
              >
                <InspectorNoun icon={MessageSquare} noun="Conversation" title={episode.memoryScope}>
                  {formatMemoryScopeLabel(episode.memoryScope, runId)}
                </InspectorNoun>
              </Link>
              <Link
                to="/agent/$agentId"
                params={{ agentId: episode.agentId }}
                className="group max-w-full min-w-0"
              >
                <InspectorNoun icon={Bot} noun="Agent" title={episode.agentId}>
                  {episode.agentId}
                </InspectorNoun>
              </Link>
            </p>
          </div>
        ) : null}
      </div>
      {!episode ? (
        <ConversationEmptyState hasConversations={step.agentEpisodes.length > 0} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <CatchBoundary
            getResetKey={() => episode.episodeId}
            errorComponent={({ error }) => (
              <div className="p-3">
                <ErrorDetails error={error} compact />
              </div>
            )}
          >
            <Await
              promise={messagesPromise}
              fallback={
                runSettled || episode.status === "failed" ? (
                  <SettledConversationFallback error={episodeError} />
                ) : (
                  <ConversationSkeleton />
                )
              }
            >
              {(prefetched) => (
                <EpisodeConversation
                  prefetched={prefetched}
                  events={events}
                  episode={episode}
                  streamingText={streamingText}
                  fallbackError={episodeError}
                  onFork={onFork}
                />
              )}
            </Await>
          </CatchBoundary>
        </div>
      )}
    </div>
  );
}

function ConversationEmptyState({ hasConversations }: { hasConversations: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center">
      <MessageSquare className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {hasConversations ? "No conversation selected" : "This step has no agent conversation"}
      </p>
      {hasConversations ? (
        <p className="text-xs text-muted-foreground">
          Select a conversation in the workflow tree to inspect it.
        </p>
      ) : null}
    </div>
  );
}

function SettledConversationFallback({ error }: { error: unknown }) {
  if (error) {
    return (
      <div className="p-3">
        <ErrorDetails error={error} />
      </div>
    );
  }
  return <p className="p-3 text-xs text-muted-foreground">No conversation recorded.</p>;
}

function EpisodeConversation({
  prefetched,
  events,
  episode,
  streamingText,
  fallbackError,
  onFork,
}: {
  prefetched: PrefetchedRunMessages;
  events: RunEvent[];
  episode: AgentEpisode;
  streamingText: string | null;
  fallbackError: unknown;
  onFork: (messages: MockMessage[]) => void;
}) {
  const { messagesByScope, pendingScopes } = useLiveRunMessages(prefetched, events);
  const messages = messagesByScope[episode.memoryScope] ?? [];
  const episodeFailed = episode.status === "failed";
  const waitingForScope =
    !episodeFailed &&
    pendingScopes.has(episode.memoryScope) &&
    messages.length === 0 &&
    !streamingText;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {waitingForScope ? (
          <ConversationSkeleton />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {!episodeFailed || messages.length > 0 ? (
              <ChatMessageList
                messages={messages}
                streamingText={episodeFailed ? null : streamingText}
                compact
                className="gap-2 p-2"
              />
            ) : null}
            {episodeFailed ? (
              <div className="p-3">
                <ErrorDetails error={episode.error ?? fallbackError ?? "Agent run failed."} />
              </div>
            ) : null}
          </div>
        )}
      </ScrollArea>
      <div className="shrink-0 space-y-2 border-t border-border/40 p-2">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Read-only in workflow context. Fork to continue in a standalone agent run.
        </p>
        <Button
          size="sm"
          className="w-full gap-2"
          variant="secondary"
          disabled={waitingForScope}
          onClick={() => onFork(messages)}
        >
          <GitBranch className="size-3.5" />
          Fork to agent run
        </Button>
      </div>
    </div>
  );
}

function WorkflowInspector({
  workflowId,
  input,
  output,
  status,
  error,
}: {
  workflowId: string;
  input: unknown;
  output: unknown;
  status: RunStatus;
  error?: unknown;
}) {
  const outputEmpty =
    status === "running"
      ? "Workflow still running…"
      : status === "cancelled"
        ? "Run cancelled. No workflow output."
        : status === "failed"
          ? "Workflow failed with no recorded output."
          : "No workflow output recorded.";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border/40 bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          {workflowId}
        </p>
        <p className="text-[10px] text-muted-foreground capitalize">{status}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <JsonPreview
            label="Workflow input"
            value={input}
            empty="No input recorded."
            className="max-h-48 bg-card/80"
          />
          {output !== undefined || status !== "failed" ? (
            <JsonPreview
              label="Workflow output"
              value={output}
              empty={outputEmpty}
              className="max-h-64 bg-card/80"
            >
              {status === "failed" && error ? <ErrorDetails error={error} compact /> : null}
            </JsonPreview>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Workflow output
              </p>
              {error ? <ErrorDetails error={error} compact /> : null}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
