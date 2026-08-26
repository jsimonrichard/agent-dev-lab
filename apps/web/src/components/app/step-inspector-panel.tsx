import { Await, CatchBoundary, Link } from "@tanstack/react-router";
import { Bot, GitBranch, Layers, MessageSquare } from "lucide-react";

import type {
  AgentEpisode,
  PrefetchedRunMessages,
  RunEvent,
  RunStatus,
  StepNode,
} from "@/lib/mock/types";
import { ChatMessageList } from "@/components/app/chat-message-list";
import { ConversationSkeleton } from "@/components/app/conversation-skeleton";
import { ErrorDetails } from "@/components/app/error-details";
import { JsonPreview } from "@/components/app/json-preview";
import {
  InspectorStack,
  InspectorStackHandle,
  InspectorStackSection,
} from "@/components/app/inspector-stack";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatStepLabel } from "@/lib/mock/run-projection";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";
import { partitionScopeTranscript } from "@/lib/scope-transcript";
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

  if (episode) {
    return (
      <ConversationInspector
        step={step}
        episode={episode}
        events={events}
        messagesPromise={messagesPromise}
        streamingText={streamingText}
        runStatus={runStatus}
        runError={runError}
        runId={runId}
      />
    );
  }

  return <StepOutputInspector step={step} runError={runError} />;
}

function StepOutputInspector({ step, runError }: { step: StepNode; runError?: unknown }) {
  const stepLabel = formatStepLabel(step.name, step.key);
  const stepError = step.error ?? (step.status === "failed" ? runError : undefined);
  const outputEmpty =
    step.status === "running"
      ? "Step in progress…"
      : step.status === "failed"
        ? "Step failed with no recorded output."
        : "No output recorded for this step.";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
          <Layers className="size-3.5 shrink-0 text-muted-foreground" />
          {stepLabel}
        </p>
        <p className="text-[10px] text-muted-foreground">Step output</p>
      </div>
      <div className="min-h-0 flex-1 p-2">
        {step.output !== undefined || !stepError ? (
          <JsonPreview
            title="Step output"
            value={step.output}
            empty={outputEmpty}
            fill
            className="bg-card/80"
          >
            {stepError ? <ErrorDetails error={stepError} compact /> : null}
          </JsonPreview>
        ) : (
          <div className="p-1">
            <ErrorDetails error={stepError} compact />
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationInspector({
  step,
  episode,
  events,
  messagesPromise,
  streamingText,
  runStatus,
  runError,
  runId,
}: {
  step: StepNode;
  episode: AgentEpisode;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  runStatus: RunStatus;
  runError?: unknown;
  runId: string;
}) {
  const stepLabel = formatStepLabel(step.name, step.key);
  const stepError = step.error ?? (step.status === "failed" ? runError : undefined);
  const episodeError = episode.error ?? (episode.status === "failed" ? stepError : undefined);
  const runSettled = runStatus !== "running";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="shrink-0 space-y-1.5 border-b border-border/40 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
          <Link
            to="/agent/$agentId/run/$runId"
            params={{ agentId: episode.agentId, runId: episode.memoryScope }}
            className="min-w-0 truncate rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            title={episode.memoryScope}
          >
            {formatMemoryScopeLabel(episode.memoryScope, runId)}
          </Link>
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          <Link
            to="/agent/$agentId"
            params={{ agentId: episode.agentId }}
            className="group max-w-full min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <InspectorNoun icon={Bot} noun="Agent" title={episode.agentId}>
              {episode.agentId}
            </InspectorNoun>
          </Link>
          <InspectorNoun icon={Layers} noun="Step" title={stepLabel}>
            {stepLabel}
          </InspectorNoun>
        </p>
      </div>
      <ConversationPanel
        episode={episode}
        events={events}
        messagesPromise={messagesPromise}
        streamingText={streamingText}
        episodeError={episodeError}
        runSettled={runSettled}
        runId={runId}
      />
    </div>
  );
}

function ConversationPanel({
  episode,
  events,
  messagesPromise,
  streamingText,
  episodeError,
  runSettled,
  runId,
}: {
  episode: AgentEpisode;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  episodeError: unknown;
  runSettled: boolean;
  runId: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <CatchBoundary
        getResetKey={() => `${runId}:${episode.episodeId}`}
        errorComponent={({ error }) => (
          <div className="p-3">
            <ErrorDetails error={error} compact />
          </div>
        )}
      >
        <Await
          key={runId}
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
              runId={runId}
              streamingText={streamingText}
              fallbackError={episodeError}
            />
          )}
        </Await>
      </CatchBoundary>
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
  runId,
  streamingText,
  fallbackError,
}: {
  prefetched: PrefetchedRunMessages;
  events: RunEvent[];
  episode: AgentEpisode;
  runId: string;
  streamingText: string | null;
  fallbackError: unknown;
}) {
  const { messagesByScope, pendingScopes } = useLiveRunMessages(runId, prefetched, events);
  const messages = messagesByScope[episode.memoryScope] ?? [];
  const { prior, current, later } = partitionScopeTranscript(messages, events, episode);
  const episodeFailed = episode.status === "failed";
  const waitingForScope =
    !episodeFailed &&
    pendingScopes.has(episode.memoryScope) &&
    messages.length === 0 &&
    !streamingText;
  const liveStreaming = episodeFailed ? null : streamingText;
  const hasTranscript =
    prior.length > 0 || current.length > 0 || later.length > 0 || Boolean(liveStreaming);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {waitingForScope ? (
          <ConversationSkeleton />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {hasTranscript ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
                {prior.length > 0 ? (
                  <ChatMessageList
                    messages={prior}
                    compact
                    showEmpty={false}
                    className="flex-none gap-2 p-0"
                  />
                ) : null}
                {prior.length > 0 ? <TranscriptMarker>This agent call</TranscriptMarker> : null}
                {current.length > 0 || liveStreaming ? (
                  <ChatMessageList
                    messages={current}
                    streamingText={liveStreaming}
                    compact
                    showEmpty={false}
                    className="flex-none gap-2 p-0"
                  />
                ) : null}
                {later.length > 0 ? (
                  <section aria-label="Later turns on this scope" className="flex flex-col gap-2">
                    <TranscriptMarker>Later on this scope</TranscriptMarker>
                    <ChatMessageList
                      messages={later}
                      compact
                      muted
                      showEmpty={false}
                      className="flex-none gap-2 p-0"
                    />
                  </section>
                ) : null}
              </div>
            ) : !episodeFailed ? (
              <p className="p-3 text-xs text-muted-foreground">No conversation recorded.</p>
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
          Read-only in this workflow view. Open the conversation to view it in full.
        </p>
        <Button size="sm" className="w-full gap-2" variant="secondary" asChild>
          <Link
            to="/agent/$agentId/run/$runId"
            params={{ agentId: episode.agentId, runId: episode.memoryScope }}
          >
            <MessageSquare className="size-3.5" />
            View Conversation
          </Link>
        </Button>
      </div>
    </div>
  );
}

function TranscriptMarker({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <div className="h-px flex-1 bg-border/70" />
      <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </span>
      <div className="h-px flex-1 bg-border/70" />
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
  const hasOutput = output !== undefined;
  const outputError = status === "failed" && error ? <ErrorDetails error={error} compact /> : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          {workflowId}
        </p>
        <p className="text-[10px] text-muted-foreground capitalize">{status}</p>
      </div>
      {hasOutput ? (
        <InspectorStack id="workflow-inspector-sections">
          <InspectorStackSection id="workflow-input" title="Workflow input" defaultSize="35%">
            <WorkflowInputPane input={input} />
          </InspectorStackSection>
          <InspectorStackHandle />
          <InspectorStackSection id="workflow-output" title="Workflow output" defaultSize="65%">
            <div className="h-full min-h-0 p-2">
              <JsonPreview title="Workflow output" value={output} fill className="bg-card/80">
                {outputError}
              </JsonPreview>
            </div>
          </InspectorStackSection>
        </InspectorStack>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <WorkflowInputPane input={input} />
          </div>
          {outputError ? <div className="shrink-0 px-2 pb-2">{outputError}</div> : null}
        </div>
      )}
    </div>
  );
}

function WorkflowInputPane({ input }: { input: unknown }) {
  return (
    <div className="h-full min-h-0 p-2">
      <JsonPreview
        title="Workflow input"
        value={input}
        empty="No input recorded."
        fill
        className="bg-card/80"
      />
    </div>
  );
}
