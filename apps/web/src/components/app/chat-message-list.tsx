import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ChatMessagePart, ChatToolResultPart, MockMessage } from "@/lib/mock/types";
import {
  collectToolCallIds,
  collectToolResults,
  isPairedToolMessage,
  messageParts,
} from "@/lib/chat-messages";
import { ChatToolCall } from "@/components/app/chat-tool-call";
import { MarkdownContent } from "@/components/app/markdown-content";

interface ChatMessageListProps {
  messages: MockMessage[];
  streamingText?: string | null;
  className?: string;
  /** Smaller markdown for narrow step inspector */
  compact?: boolean;
}

export function ChatMessageList({
  messages,
  streamingText,
  className,
  compact = false,
}: ChatMessageListProps) {
  const resultsById = collectToolResults(messages);
  const callIds = collectToolCallIds(messages);

  return (
    <div className={cn("flex flex-1 flex-col gap-4 p-4", className)}>
      {messages.map((message) => {
        if (isPairedToolMessage(message, callIds)) {
          return null;
        }
        return (
          <ChatItem
            key={message.id}
            message={message}
            resultsById={resultsById}
            compact={compact}
          />
        );
      })}
      {streamingText ? (
        <ChatBubble role="assistant" streaming compact={compact}>
          <MarkdownContent content={streamingText} compact={compact} />
        </ChatBubble>
      ) : null}
      {messages.length === 0 && !streamingText ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No messages yet. Send a message to start the conversation.
        </p>
      ) : null}
    </div>
  );
}

function ChatItem({
  message,
  resultsById,
  compact,
}: {
  message: MockMessage;
  resultsById: Map<string, ChatToolResultPart>;
  compact: boolean;
}) {
  const parts = messageParts(message);
  const shownCallIds = new Set<string>();
  const rendered = parts.flatMap((part, index) =>
    renderPart(part, index, message.role, resultsById, shownCallIds, compact),
  );

  if (rendered.length === 0) {
    return null;
  }

  const hasText = parts.some((part) => part.type === "text" && part.text.trim());
  if (!hasText) {
    return <div className="flex max-w-[min(85%,42rem)] flex-col gap-2">{rendered}</div>;
  }

  return (
    <ChatBubble role={message.role} compact={compact}>
      <div className="flex flex-col gap-2">{rendered}</div>
    </ChatBubble>
  );
}

function renderPart(
  part: ChatMessagePart,
  index: number,
  role: MockMessage["role"],
  resultsById: Map<string, ChatToolResultPart>,
  shownCallIds: Set<string>,
  compact: boolean,
): ReactNode[] {
  if (part.type === "text") {
    if (!part.text.trim()) {
      return [];
    }
    return [
      <MarkdownContent
        key={`text-${index}`}
        content={part.text}
        compact={compact}
        tone={role === "user" ? "on-primary" : role === "system" ? "muted" : "default"}
      />,
    ];
  }
  if (part.type === "tool-call") {
    shownCallIds.add(part.toolCallId);
    return [
      <ChatToolCall
        key={part.toolCallId}
        call={part}
        result={resultsById.get(part.toolCallId)}
        compact={compact}
      />,
    ];
  }
  if (shownCallIds.has(part.toolCallId)) {
    return [];
  }
  return [
    <ChatToolCall key={part.toolCallId || `result-${index}`} result={part} compact={compact} />,
  ];
}

function ChatBubble({
  role,
  children,
  streaming = false,
  compact = false,
}: {
  role: MockMessage["role"];
  children: ReactNode;
  streaming?: boolean;
  compact?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="mx-auto max-w-lg rounded-md border border-dashed border-border/50 bg-muted/30 px-3 py-2 text-center">
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(85%,42rem)] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border/40 bg-card text-card-foreground",
          streaming && "border-primary/25",
          compact && "px-3 py-2 text-xs",
        )}
      >
        {children}
        {streaming ? (
          <span className="mt-1 inline-block text-xs text-muted-foreground">Streaming…</span>
        ) : null}
      </div>
    </div>
  );
}
