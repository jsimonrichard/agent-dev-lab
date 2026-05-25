import { cn } from "@/lib/utils";
import type { MockMessage } from "@/lib/mock/types";
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
  return (
    <div className={cn("flex flex-1 flex-col gap-4 p-4", className)}>
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          role={message.role}
          content={message.content}
          compact={compact}
        />
      ))}
      {streamingText ? (
        <ChatBubble role="assistant" content={streamingText} streaming compact={compact} />
      ) : null}
      {messages.length === 0 && !streamingText ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No messages yet. Send a message to start the conversation.
        </p>
      ) : null}
    </div>
  );
}

function ChatBubble({
  role,
  content,
  streaming = false,
  compact = false,
}: {
  role: MockMessage["role"];
  content: string;
  streaming?: boolean;
  compact?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="mx-auto max-w-lg rounded-md border border-dashed border-border/50 bg-muted/30 px-3 py-2 text-center">
        <MarkdownContent content={content} compact className="text-muted-foreground" />
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
        )}
      >
        <MarkdownContent
          content={content}
          compact={compact}
          inverted={isUser}
          className={cn(
            isUser && "prose-a:text-primary-foreground",
            !isUser && "text-card-foreground",
          )}
        />
        {streaming ? (
          <span className="mt-1 inline-block text-xs text-muted-foreground">Streaming…</span>
        ) : null}
      </div>
    </div>
  );
}
