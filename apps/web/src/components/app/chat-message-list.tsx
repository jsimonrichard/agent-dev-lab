import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { MockMessage } from "@/lib/mock/types";
import { parseStructuredJson, toChatDisplayItems } from "@/lib/chat-messages";
import { ChatToolCall } from "@/components/app/chat-tool-call";
import { JsonPreview } from "@/components/app/json-preview";
import { MarkdownContent } from "@/components/app/markdown-content";

interface ChatMessageListProps {
  messages: MockMessage[];
  streamingText?: string | null;
  className?: string;
  /** Smaller markdown for narrow step inspector */
  compact?: boolean;
  /** Fade the list (later turns on a shared memory scope). */
  muted?: boolean;
  /** When false, skip the empty-state placeholder. Default true. */
  showEmpty?: boolean;
}

export function ChatMessageList({
  messages,
  streamingText,
  className,
  compact = false,
  muted = false,
  showEmpty = true,
}: ChatMessageListProps) {
  const items = toChatDisplayItems(messages);
  const streamingJson = streamingText ? parseStructuredJson(streamingText) : undefined;

  return (
    <div
      className={cn(
        "flex min-w-0 w-full flex-1 flex-col gap-4 p-4",
        muted && "opacity-45",
        className,
      )}
    >
      {items.map((item) => {
        if (item.type === "text") {
          return (
            <ChatBubble key={item.key} role={item.role} compact={compact}>
              <MarkdownContent
                content={item.text}
                compact={compact}
                tone={
                  item.role === "user" ? "on-primary" : item.role === "system" ? "muted" : "default"
                }
              />
            </ChatBubble>
          );
        }
        if (item.type === "json") {
          return (
            <ChatBubble key={item.key} role={item.role} compact={compact} structured>
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
            <ToolMessage key={item.key} compact={compact}>
              <ChatToolCall call={item.call} pending={item.pending} compact={compact} />
            </ToolMessage>
          );
        }
        return (
          <ToolMessage key={item.key} compact={compact}>
            <ChatToolCall result={item.result} compact={compact} />
          </ToolMessage>
        );
      })}
      {streamingText ? (
        streamingJson !== undefined ? (
          <ChatBubble role="assistant" streaming compact={compact} structured>
            <JsonPreview
              value={streamingJson}
              label="Structured Output"
              scroll={false}
              className="bg-card/80"
            />
          </ChatBubble>
        ) : (
          <ChatBubble role="assistant" streaming compact={compact}>
            <MarkdownContent content={streamingText} compact={compact} />
          </ChatBubble>
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

/** Opposite-side inset so user/assistant rows don't share the same left/right edges. */
const USER_GUTTER = "pl-[clamp(1.5rem,18%,6rem)]";
const ASSISTANT_GUTTER = "pr-[clamp(1.5rem,18%,6rem)]";

function ToolMessage({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex w-full min-w-0 justify-start", ASSISTANT_GUTTER)}>
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
}: {
  role: MockMessage["role"];
  children: ReactNode;
  streaming?: boolean;
  compact?: boolean;
  /** Structured JSON fills the blob width and must not overflow it. */
  structured?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="mx-auto max-w-lg rounded-md border border-dashed border-border/50 bg-muted/30 px-3 py-2 text-center">
        <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          System prompt
        </p>
        {children}
      </div>
    );
  }

  return (
    <div
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
