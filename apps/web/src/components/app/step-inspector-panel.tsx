import { CatchBoundary, Link } from "@tanstack/react-router";
import { Bot, ExternalLink, GitBranch, Layers, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  AgentEpisode,
  PrefetchedRunMessages,
  RunEvent,
  RunStatus,
  StepNode,
} from "@/lib/view-model/types";
import { ChatMessageList, SystemPromptBanner } from "@/components/app/chat-message-list";
import { ConversationSkeleton } from "@/components/app/conversation-skeleton";
import { agentRunSearch } from "@/lib/agent/agent-location";
import { ErrorDetails } from "@/components/app/error-details";
import { JsonPreview } from "@/components/app/json-preview";
import {
  InspectorStack,
  InspectorStackHandle,
  InspectorStackSection,
} from "@/components/app/inspector-stack";
import { Button } from "@/components/ui/button";
import { RunTagsFooter } from "@/components/app/run-tags-footer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatStepLabel } from "@/lib/view-model/run-projection";
import {
  extractSystemPromptFromMessages,
  conversationMessagesWithoutSystem,
} from "@/lib/chat-messages";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";
import { formatTokenUsageDetail } from "@/lib/format-token-usage";
import { partitionScopeTranscript } from "@/lib/scope-transcript";
import { InspectorNoun } from "@/components/app/inspector-noun";
import { useLiveRunMessages } from "@/hooks/use-live-run-messages";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

interface StepInspectorPanelProps {
  step: StepNode | undefined;
  episode: AgentEpisode | null;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  workflowId: string;
  runId: string;
  tags: string[];
  workflowInput: unknown;
  workflowOutput: unknown;
  runStatus: RunStatus;
  runError?: unknown;
  /** When set, the workflow inspector links to this nested run's dedicated page. */
  nestedRunLink?: { workflowId: string; runId: string } | null;
  /** Nested run (or other deferred view) selected but events not in cache yet. */
  loading?: boolean;
  canRetry?: boolean;
  retryBusy?: boolean;
  onRetryFromStep?: () => void;
}

export function StepInspectorPanel({
  step,
  episode,
  events,
  messagesPromise,
  streamingText,
  workflowId,
  runId,
  tags,
  workflowInput,
  workflowOutput,
  runStatus,
  runError,
  nestedRunLink = null,
  loading = false,
  canRetry = false,
  retryBusy = false,
  onRetryFromStep,
}: StepInspectorPanelProps) {
  const body = loading ? (
    <WorkflowInspectorSkeleton />
  ) : !step ? (
    <WorkflowInspector
      workflowId={workflowId}
      input={workflowInput}
      output={workflowOutput}
      status={runStatus}
      error={runError}
      nestedRunLink={nestedRunLink}
    />
  ) : episode ? (
    <ConversationInspector
      step={step}
      episode={episode}
      events={events}
      messagesPromise={messagesPromise}
      streamingText={streamingText}
      runStatus={runStatus}
      runError={runError}
      runId={runId}
      canRetry={canRetry}
      retryBusy={retryBusy}
      onRetryFromStep={onRetryFromStep}
    />
  ) : (
    <StepOutputInspector
      step={step}
      runError={runError}
      canRetry={canRetry}
      retryBusy={retryBusy}
      onRetryFromStep={onRetryFromStep}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      <RunTagsFooter tags={tags} />
    </div>
  );
}

function StepOutputInspector({
  step,
  runError,
  canRetry,
  retryBusy,
  onRetryFromStep,
}: {
  step: StepNode;
  runError?: unknown;
  canRetry?: boolean;
  retryBusy?: boolean;
  onRetryFromStep?: () => void;
}) {
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
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
            <Layers className="size-3.5 shrink-0 text-muted-foreground" />
            {stepLabel}
          </p>
          <p className="text-[10px] text-muted-foreground">Step Output</p>
        </div>
        {canRetry && onRetryFromStep ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="retry-from-step"
            disabled={retryBusy}
            onClick={onRetryFromStep}
          >
            <GitBranch className="mr-1.5 size-3.5" />
            {retryBusy ? "Retrying…" : "Retry from here"}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 p-2">
        {step.output !== undefined || !stepError ? (
          <JsonPreview
            title="Step Output"
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
  canRetry,
  retryBusy,
  onRetryFromStep,
}: {
  step: StepNode;
  episode: AgentEpisode;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  runStatus: RunStatus;
  runError?: unknown;
  runId: string;
  canRetry?: boolean;
  retryBusy?: boolean;
  onRetryFromStep?: () => void;
}) {
  const { project } = useAppLoaderData();
  const agentRegistered = project.agentIds.includes(episode.agentId);
  const stepLabel = formatStepLabel(step.name, step.key);
  const stepError = step.error ?? (step.status === "failed" ? runError : undefined);
  const episodeError = episode.error ?? (episode.status === "failed" ? stepError : undefined);
  const runSettled = runStatus !== "running";

  const scopeLabel = (
    <span className="min-w-0 truncate" title={episode.memoryScope}>
      {formatMemoryScopeLabel(episode.memoryScope, runId)}
    </span>
  );
  const agentLabel = (
    <InspectorNoun icon={Bot} noun="Agent" title={episode.agentId}>
      {episode.agentId}
    </InspectorNoun>
  );
  const usageDetail = formatTokenUsageDetail(episode.usage);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="min-w-0 space-y-1.5">
          <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold">
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            {agentRegistered ? (
              <Link
                to="/agent/$agentId/run/$runId"
                params={{ agentId: episode.agentId, runId: episode.memoryScope }}
                search={agentRunSearch({ call: episode.episodeId })}
                className="min-w-0 truncate rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                title={episode.memoryScope}
              >
                {scopeLabel}
              </Link>
            ) : (
              scopeLabel
            )}
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            {agentRegistered ? (
              <Link
                to="/agent/$agentId"
                params={{ agentId: episode.agentId }}
                className="group max-w-full min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {agentLabel}
              </Link>
            ) : (
              agentLabel
            )}
            <InspectorNoun icon={Layers} noun="Step" title={stepLabel}>
              {stepLabel}
            </InspectorNoun>
          </p>
          {usageDetail ? (
            <p className="truncate text-[11px] text-muted-foreground" title={usageDetail}>
              Tokens · {usageDetail}
            </p>
          ) : null}
        </div>
        {canRetry && onRetryFromStep ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="retry-from-step"
            disabled={retryBusy}
            onClick={onRetryFromStep}
          >
            <GitBranch className="mr-1.5 size-3.5" />
            {retryBusy ? "Retrying…" : "Retry from here"}
          </Button>
        ) : null}
      </div>
      {episode.warnings.length > 0 ? (
        <div
          role="status"
          className="shrink-0 space-y-1 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5"
        >
          {episode.warnings.map((warning) => (
            <p
              key={warning}
              className="text-[11px] text-amber-800 dark:text-amber-200"
              title={warning}
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      <div className="shrink-0 border-b border-border/40 p-2">
        <JsonPreview
          title="Episode tool context"
          value={episode.toolProviderContext}
          empty="Not recorded."
          className="bg-card/80"
        />
      </div>
      <ConversationPanel
        episode={episode}
        events={events}
        messagesPromise={messagesPromise}
        streamingText={streamingText}
        episodeError={episodeError}
        runSettled={runSettled}
        runId={runId}
        agentRegistered={agentRegistered}
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
  agentRegistered,
}: {
  episode: AgentEpisode;
  events: RunEvent[];
  messagesPromise: Promise<PrefetchedRunMessages>;
  streamingText: string | null;
  episodeError: unknown;
  runSettled: boolean;
  runId: string;
  agentRegistered: boolean;
}) {
  // Keep the last resolved prefetch while a replacement promise loads (e.g. after
  // `router.invalidate` on run settle). Remounting `<Await>` into its settled
  // fallback was flashing "No conversation recorded." over a visible transcript.
  const [prefetched, setPrefetched] = useState<PrefetchedRunMessages | null>(null);

  useEffect(() => {
    setPrefetched(null);
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    void messagesPromise.then((next) => {
      if (!cancelled) {
        setPrefetched(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [messagesPromise]);

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
        {prefetched ? (
          <EpisodeConversation
            prefetched={prefetched}
            events={events}
            episode={episode}
            runId={runId}
            streamingText={streamingText}
            fallbackError={episodeError}
            agentRegistered={agentRegistered}
          />
        ) : runSettled || episode.status === "failed" ? (
          <SettledConversationFallback error={episodeError} />
        ) : (
          <ConversationSkeleton />
        )}
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
  agentRegistered,
}: {
  prefetched: PrefetchedRunMessages;
  events: RunEvent[];
  episode: AgentEpisode;
  runId: string;
  streamingText: string | null;
  fallbackError: unknown;
  agentRegistered: boolean;
}) {
  const { messagesByScope, pendingScopes } = useLiveRunMessages(runId, prefetched, events);
  const messages = messagesByScope[episode.memoryScope] ?? [];
  const storedSystemPrompt = extractSystemPromptFromMessages(messages);
  const transcript = conversationMessagesWithoutSystem(messages);
  const { prior, current, later } = partitionScopeTranscript(transcript, events, episode, {
    commitTotalOffset: storedSystemPrompt ? 1 : 0,
  });
  const episodeFailed = episode.status === "failed";
  const hasStoredTranscript = prior.length > 0 || current.length > 0 || later.length > 0;
  // Parent clears `streamingText` when status leaves "running". Hold the episode's
  // accumulated deltas until stored messages replace them so we do not flash empty.
  const liveStreaming = episodeFailed
    ? null
    : streamingText?.trim()
      ? streamingText
      : hasStoredTranscript
        ? null
        : episode.streamingText.trim()
          ? episode.streamingText
          : null;
  const hasTranscript = hasStoredTranscript || Boolean(liveStreaming);
  const hasCommitForEpisode = events.some(
    (event) => event.type === "messages_committed" && event.episodeId === episode.episodeId,
  );
  const waitingForScope =
    !episodeFailed &&
    !hasTranscript &&
    (pendingScopes.has(episode.memoryScope) ||
      episode.status === "running" ||
      (episode.status === "completed" && hasCommitForEpisode));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {waitingForScope ? (
          <ConversationSkeleton />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {storedSystemPrompt ? (
              <div className={hasTranscript ? "px-2 pt-2" : "p-2"}>
                <SystemPromptBanner content={storedSystemPrompt} compact />
              </div>
            ) : null}
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
                {prior.length > 0 ? <TranscriptMarker>This Agent Call</TranscriptMarker> : null}
                {current.length > 0 || liveStreaming || episode.status === "running" ? (
                  <ChatMessageList
                    messages={current}
                    streamingText={liveStreaming}
                    isStreaming={episode.status === "running"}
                    compact
                    showEmpty={false}
                    className="flex-none gap-2 p-0"
                  />
                ) : null}
                {later.length > 0 ? (
                  <section aria-label="Later turns on this scope" className="flex flex-col gap-2">
                    <TranscriptMarker>Later on This Scope</TranscriptMarker>
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
          {agentRegistered
            ? "Read-only in this workflow view. Open the conversation to view it in full."
            : "Read-only in this workflow view."}
        </p>
        <ViewConversationButton
          agentId={episode.agentId}
          memoryScope={episode.memoryScope}
          episodeId={episode.episodeId}
          agentRegistered={agentRegistered}
        />
      </div>
    </div>
  );
}

function ViewConversationButton({
  agentId,
  memoryScope,
  episodeId,
  agentRegistered,
}: {
  agentId: string;
  memoryScope: string;
  episodeId: string;
  agentRegistered: boolean;
}) {
  const button = (
    <Button
      size="sm"
      className="w-full gap-2"
      variant="secondary"
      disabled={!agentRegistered}
      asChild={agentRegistered}
    >
      {agentRegistered ? (
        <Link
          to="/agent/$agentId/run/$runId"
          params={{ agentId, runId: memoryScope }}
          search={agentRunSearch({ call: episodeId })}
        >
          <MessageSquare className="size-3.5" />
          View Conversation
        </Link>
      ) : (
        <>
          <MessageSquare className="size-3.5" />
          View Conversation
        </>
      )}
    </Button>
  );

  if (agentRegistered) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full">{button}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-left">
          Agent &quot;{agentId}&quot; is not in the project registry, so the conversation page is
          unavailable. Add it to the <code className="font-mono">agents</code> array in{" "}
          <code className="font-mono">adl.config.ts</code> to enable this.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  nestedRunLink,
}: {
  workflowId: string;
  input: unknown;
  output: unknown;
  status: RunStatus;
  error?: unknown;
  nestedRunLink?: { workflowId: string; runId: string } | null;
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
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className="text-[10px] text-muted-foreground capitalize">{status}</p>
          {nestedRunLink ? (
            <Link
              to="/workflows/$workflowId/run/$runId"
              params={{
                workflowId: nestedRunLink.workflowId,
                runId: nestedRunLink.runId,
              }}
              className="inline-flex min-w-0 items-center gap-1 text-[10px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-2.5 shrink-0" aria-hidden />
              <span className="truncate">Open run</span>
            </Link>
          ) : null}
        </div>
      </div>
      {hasOutput ? (
        <InspectorStack id="workflow-inspector-sections">
          <InspectorStackSection id="workflow-input" title="Workflow Input" defaultSize="35%">
            <WorkflowInputPane input={input} />
          </InspectorStackSection>
          <InspectorStackHandle />
          <InspectorStackSection id="workflow-output" title="Workflow Output" defaultSize="65%">
            <div className="h-full min-h-0 p-2">
              <JsonPreview title="Workflow Output" value={output} fill className="bg-card/80">
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
        title="Workflow Input"
        value={input}
        empty="No input recorded."
        fill
        className="bg-card/80"
      />
    </div>
  );
}

function WorkflowInspectorSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10"
      aria-busy="true"
      aria-label="Loading workflow inspector"
    >
      <div className="shrink-0 space-y-1.5 border-b border-border/40 px-3 py-2.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="min-h-0 flex-1 w-full" />
      </div>
    </div>
  );
}
