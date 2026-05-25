import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
}

export function ChatComposer({
  disabled,
  placeholder = "Message the agent…",
  onSend,
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border/40 bg-background p-4"
    >
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-10 max-h-32 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <Button type="submit" size="icon" disabled={disabled || !draft.trim()}>
        <Send className="size-4" />
        <span className="sr-only">Send</span>
      </Button>
    </form>
  );
}
