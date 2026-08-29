import type { ReactNode, Ref } from "react";
import { Fragment, useEffect, useRef } from "react";
import type { Result } from "@agent-dev-lab/core/result";

import { cn } from "@/lib/utils";
import type { InspectorMessage } from "@/lib/view-model/types";
import { type ChatDisplayItem, parseStructuredJson, toChatDisplayItems } from "@/lib/chat-messages";
import { ChatToolCall } from "@/components/app/chat-tool-call";
import { ErrorDetails } from "@/components/app/error-details";
import { JsonPreview } from "@/components/app/json-preview";
import { MarkdownContent } from "@/components/app/markdown-content";

interface ChatMessageListProps {
  messages: InspectorMessage[];
  streamingText?: string | null;
  /** When false, streamed text stays visible but without the live "Streaming…" chrome. */
  isStreaming?: boolean;
  className?: string;
  /** Smaller markdown for narrow step inspector */
  compact?: boolean;
  /** Fade the list (later turns on a shared memory scope). */
  muted?: boolean;
  /** When false, skip the empty-state placeholder. Default true. */
  showEmpty?: boolean;
  /** Fallback overlay when the transcript has no pinned system message (empty / not-yet-pinned conversations). */
  systemPrompt?: Result<string, string> | null;
  /** Highlight every stored bubble that belongs to these message ids (one agent call). */
  focusMessageIds?: ReadonlySet<string>;
  /** When true, include the live streaming bubble in the same call highlight. */
  focusStreaming?: boolean;
}

export function ChatMessageList({
  messages,
  streamingText,
  isStreaming = true,
  className,
  compact = false,
  muted = false,
  showEmpty = true,
  systemPrompt,
  focusMessageIds,
  focusStreaming = false,
}: ChatMessageListProps) {
  const hasStoredSystem = messages[0]?.role === "system";
  const items = toChatDisplayItems(messages);
  const overlayPrompt = !hasStoredSystem ? systemPrompt : null;
  const streamingJson = streamingText ? parseStructuredJson(streamingText) : undefined;
  const focusRef = useRef<HTMLDivElement>(null);
  const focusIds = focusMessageIds && focusMessageIds.size > 0 ? focusMessageIds : undefined;
  const groups = groupDisplayItemsByFocus(items, focusIds);
  const lastGroup = groups.at(-1);
  const streamingInsideLastBand = Boolean(focusStreaming && streamingText && lastGroup?.focused);
  const lastFocusKey =
    !focusStreaming && focusIds
      ? [...items].reverse().find((item) => displayItemBelongsToFocus(item, focusIds))?.key
      : undefined;

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusIds, focusStreaming, lastFocusKey, streamingText]);

  function renderItem(item: ChatDisplayItem) {
    return (
      <ChatDisplayItemView
        key={item.key}
        item={item}
        compact={compact}
        rowRef={lastFocusKey === item.key ? focusRef : undefined}
      />
    );
  }

  function renderStreaming() {
    if (!streamingText) {
      return null;
    }
    const rowRef = focusStreaming ? focusRef : undefined;
    if (streamingJson !== undefined) {
      return (
        <ChatBubble
          role="assistant"
          streaming={isStreaming}
          compact={compact}
          structured
          rowRef={rowRef}
        >
          <JsonPreview
            value={streamingJson}
            label="Structured Output"
            scroll={false}
            className="bg-card/80"
          />
        </ChatBubble>
      );
    }
    return (
      <ChatBubble role="assistant" streaming={isStreaming} compact={compact} rowRef={rowRef}>
        <MarkdownContent content={streamingText} compact={compact} />
      </ChatBubble>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 w-full flex-1 flex-col gap-4 p-4",
        muted && "opacity-45",
        className,
      )}
    >
      {overlayPrompt ? <LiveSystemPromptOverlay prompt={overlayPrompt} compact={compact} /> : null}
      {groups.map((group, index) => {
        const includeStreaming = streamingInsideLastBand && index === groups.length - 1;
        const content = (
          <>
            {group.items.map(renderItem)}
            {includeStreaming ? renderStreaming() : null}
          </>
        );
        if (!group.focused) {
          return <Fragment key={group.items[0]?.key ?? index}>{content}</Fragment>;
        }
        return (
          <AgentCallHighlight key={group.items[0]?.key ?? index}>{content}</AgentCallHighlight>
        );
      })}
      {streamingText && !streamingInsideLastBand ? (
        focusStreaming ? (
          <AgentCallHighlight>{renderStreaming()}</AgentCallHighlight>
        ) : (
          renderStreaming()
        )
      ) : null}
      {showEmpty && items.length === 0 && !streamingText ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No messages yet. Send a message to start the conversation.
        </p>
      ) : null}
    </div>
  );
}

function groupDisplayItemsByFocus(
  items: ChatDisplayItem[],
  focusIds: ReadonlySet<string> | undefined,
): Array<{ focused: boolean; items: ChatDisplayItem[] }> {
  const groups: Array<{ focused: boolean; items: ChatDisplayItem[] }> = [];
  for (const item of items) {
    const focused = displayItemBelongsToFocus(item, focusIds);
    const last = groups.at(-1);
    if (last && last.focused === focused) {
      last.items.push(item);
    } else {
      groups.push({ focused, items: [item] });
    }
  }
  return groups;
}

function displayItemBelongsToFocus(
  item: ChatDisplayItem,
  focusIds: ReadonlySet<string> | undefined,
): boolean {
  if (!focusIds) {
    return false;
  }
  for (const id of focusIds) {
    if (item.key.startsWith(`${id}-`)) {
      return true;
    }
  }
  return false;
}

function ChatDisplayItemView({
  item,
  compact,
  rowRef,
}: {
  item: ChatDisplayItem;
  compact: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  if (item.type === "text") {
    return (
      <ChatBubble role={item.role} compact={compact} rowRef={rowRef}>
        <MarkdownContent
          content={item.text}
          compact={compact}
          tone={item.role === "user" ? "on-primary" : item.role === "system" ? "muted" : "default"}
        />
      </ChatBubble>
    );
  }
  if (item.type === "json") {
    return (
      <ChatBubble role={item.role} compact={compact} structured rowRef={rowRef}>
        <JsonPreview
          value={item.value}
          label="Structured Output"
          scroll={false}
          className="bg-card/80"
        />
      </ChatBubble>
    );
  }
  if (item.type === "tool-call") {
    return (
      <ToolMessage compact={compact} rowRef={rowRef}>
        <ChatToolCall call={item.call} pending={item.pending} compact={compact} />
      </ToolMessage>
    );
  }
  return (
    <ToolMessage compact={compact} rowRef={rowRef}>
      <ChatToolCall result={item.result} compact={compact} />
    </ToolMessage>
  );
}

function AgentCallHighlight({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="This agent call"
      data-agent-call-highlight=""
      className="-mx-1 flex flex-col gap-4 rounded-2xl bg-primary/10 px-3 py-3 ring-1 ring-inset ring-primary/20"
    >
      {children}
    </div>
  );
}

/** Opposite-side inset so user/assistant rows don't share the same left/right edges. */
const USER_GUTTER = "pl-[clamp(1.5rem,18%,6rem)]";
const ASSISTANT_GUTTER = "pr-[clamp(1.5rem,18%,6rem)]";

function ToolMessage({
  children,
  compact,
  rowRef,
}: {
  children: ReactNode;
  compact?: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={rowRef} className={cn("flex w-full min-w-0 justify-start", ASSISTANT_GUTTER)}>
      <div className={cn("min-w-0 w-full max-w-full", !compact && "max-w-[min(100%,42rem)]")}>
        {children}
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  children,
  streaming = false,
  compact = false,
  structured = false,
  rowRef,
}: {
  role: InspectorMessage["role"];
  children: ReactNode;
  streaming?: boolean;
  compact?: boolean;
  /** Structured JSON fills the blob width and must not overflow it. */
  structured?: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const isUser = role === "user";

  if (role === "system") {
    return (
      <div ref={rowRef}>
        <SystemPromptFrame compact={compact}>{children}</SystemPromptFrame>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex w-full min-w-0",
        isUser ? cn("justify-end", USER_GUTTER) : cn("justify-start", ASSISTANT_GUTTER),
      )}
    >
      <div
        className={cn(
          "min-w-0 max-w-full overflow-hidden rounded-2xl text-sm shadow-sm",
          (compact || structured) && "w-full",
          !compact && "max-w-[min(100%,42rem)]",
          structured ? "p-1.5" : compact ? "px-3 py-2 text-xs" : "px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border/40 bg-card text-card-foreground",
          streaming && "border-primary/25",
        )}
      >
        {children}
        {streaming ? (
          <span className="mt-1 inline-block px-1 text-xs text-muted-foreground">Streaming…</span>
        ) : null}
      </div>
    </div>
  );
}

function SystemPromptFrame({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto w-full rounded-md border border-dashed border-border/50 bg-muted/30 px-3 py-2",
        compact ? "max-w-none" : "max-w-lg",
      )}
    >
      <p className="mb-1 text-center text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        System prompt
      </p>
      <div className="text-left">{children}</div>
    </div>
  );
}

/** Overlay of the agent's resolved system prompt (conversations without a stored system message). */
export function SystemPromptBanner({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  const prompt = content.trim();
  if (!prompt) {
    return null;
  }
  return (
    <SystemPromptFrame compact={compact}>
      <MarkdownContent content={prompt} compact={compact} tone="muted" />
    </SystemPromptFrame>
  );
}

function LiveSystemPromptOverlay({
  prompt,
  compact,
}: {
  prompt: Result<string, string>;
  compact?: boolean;
}) {
  if (prompt.isErr) {
    return (
      <SystemPromptFrame compact={compact}>
        <ErrorDetails error={prompt.error} compact />
      </SystemPromptFrame>
    );
  }
  return <SystemPromptBanner content={prompt.value} compact={compact} />;
}
