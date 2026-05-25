import { cn } from "@/lib/utils";
import type { MockMessage } from "@/lib/mock/types";

interface ChatMessageListProps {
  messages: MockMessage[];
  streamingText?: string | null;
  className?: string;
}

export function ChatMessageList({ messages, streamingText, className }: ChatMessageListProps) {
  return (
    <div className={cn("flex flex-1 flex-col gap-4 p-4", className)}>
      {messages.map((message) => (
        <ChatBubble key={message.id} role={message.role} content={message.content} />
      ))}
      {streamingText ? <ChatBubble role="assistant" content={streamingText} streaming /> : null}
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
}: {
  role: MockMessage["role"];
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="mx-auto max-w-lg rounded-md border border-dashed bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
        {content}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(85%,42rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "border bg-card text-card-foreground",
          streaming && "border-primary/30",
        )}
      >
        <p className="m-0 whitespace-pre-wrap">{content}</p>
        {streaming ? (
          <span className="mt-1 inline-block text-xs text-muted-foreground">Streaming…</span>
        ) : null}
      </div>
    </div>
  );
}
