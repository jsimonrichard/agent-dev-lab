import { ChevronRight, Wrench } from "lucide-react";

import type { ChatToolCallPart, ChatToolResultPart } from "@/lib/mock/types";
import { JsonPreview } from "@/components/app/json-preview";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ChatToolCallProps {
  call?: ChatToolCallPart;
  result?: ChatToolResultPart;
  compact?: boolean;
}

export function ChatToolCall({ call, result, compact = false }: ChatToolCallProps) {
  const name = call?.toolName ?? result?.toolName ?? "tool";
  const isError = result?.isError === true;
  const pending = call != null && result == null;

  return (
    <Collapsible
      className={cn(
        "group/tool overflow-hidden rounded-lg border border-border/40 bg-muted/20",
        compact ? "text-[11px]" : "text-xs",
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40">
        <Wrench className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-mono font-medium">{name}</span>
        <Badge
          variant={isError ? "destructive" : pending ? "outline" : "secondary"}
          className="h-4 font-mono text-[10px]"
        >
          {isError ? "error" : pending ? "call" : "result"}
        </Badge>
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t border-border/40 px-2.5 py-2">
        {call ? (
          <JsonPreview
            label="Arguments"
            value={call.args}
            empty="No arguments."
            className={cn("bg-card/80", compact ? "max-h-24" : "max-h-40")}
          />
        ) : null}
        {result ? (
          <JsonPreview
            label="Result"
            value={result.result}
            className={cn(
              "bg-card/80",
              compact ? "max-h-28" : "max-h-48",
              isError && "text-destructive",
            )}
          />
        ) : (
          <p className="text-[10px] text-muted-foreground">Awaiting result…</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
