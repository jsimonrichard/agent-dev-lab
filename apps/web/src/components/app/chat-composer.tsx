import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MIN_HEIGHT_PX = 40;
const MAX_HEIGHT_PX = 160;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = `${MIN_HEIGHT_PX}px`;
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [draft, syncHeight]);

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
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-10 max-h-40 flex-1 resize-none overflow-hidden py-2.5 leading-relaxed"
        style={{ height: MIN_HEIGHT_PX }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <Button type="submit" size="icon" className="shrink-0" disabled={disabled || !draft.trim()}>
        <Send className="size-4" />
        <span className="sr-only">Send</span>
      </Button>
    </form>
  );
}
