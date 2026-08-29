import { ChevronRight, CircleAlert, CornerDownRight, Loader2, Wrench } from "lucide-react";

import type { ChatToolCallPart, ChatToolResultPart } from "@/lib/view-model/types";
import { isEmptyToolArgs } from "@/lib/chat-messages";
import { JsonPreview } from "@/components/app/json-preview";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ChatToolCallProps = {
  compact?: boolean;
} & (
  | { call: ChatToolCallPart; result?: never; pending?: boolean }
  | { call?: never; result: ChatToolResultPart; pending?: never }
);

export function ChatToolCall(props: ChatToolCallProps) {
  const compact = props.compact === true;
  const isResult = props.result != null;
  const name = isResult ? props.result.toolName : props.call.toolName;
  const isError = isResult && props.result.isError === true;
  const pending = !isResult && props.pending === true;
  const providerExecuted = isResult
    ? props.result.providerExecuted === true
    : props.call.providerExecuted === true;
  const providerAction = !isResult && props.call.providerAction === true;
  const Icon = isError ? CircleAlert : isResult ? CornerDownRight : pending ? Loader2 : Wrench;
  const badgeLabel = isError
    ? "error"
    : isResult
      ? "result"
      : pending
        ? "running"
        : providerAction
          ? "openai action"
          : "call";
  const badgeVariant = isError ? "destructive" : pending ? "outline" : "secondary";
  const args = isResult ? undefined : props.call.args;
  const emptyArgs = !isResult && isEmptyToolArgs(args);
  const argsLabel = providerAction ? "Action" : "Arguments";
  const rowLabel = isResult
    ? `Tool result ${name}`
    : providerAction
      ? `OpenAI action ${name}`
      : `Tool call ${name}`;

  return (
    <Collapsible
      className={cn(
        "group/tool min-w-0 w-full max-w-full overflow-hidden rounded-2xl border shadow-sm",
        compact ? "text-[11px]" : "text-xs",
        isError
          ? "border-destructive/40 bg-destructive/5"
          : isResult
            ? "border-border/40 bg-card"
            : "border-border/40 bg-muted/30",
      )}
    >
      <CollapsibleTrigger
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
        aria-label={rowLabel}
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            pending && "animate-spin",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 truncate font-mono font-medium">{name}</span>
        <Badge variant={badgeVariant} className="h-4 font-mono text-[10px]">
          {badgeLabel}
        </Badge>
        {providerExecuted && !providerAction ? (
          <Badge variant="outline" className="h-4 font-mono text-[10px]">
            provider
          </Badge>
        ) : null}
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full min-w-0 overflow-hidden space-y-2 border-t border-border/40 px-3 py-2">
        {isResult ? (
          <JsonPreview
            label="Result"
            value={props.result.result}
            className={cn(
              "bg-card/80",
              compact ? "max-h-28" : "max-h-48",
              isError && "text-destructive",
            )}
          />
        ) : (
          <JsonPreview
            label={argsLabel}
            value={emptyArgs ? undefined : args}
            empty={
              providerExecuted
                ? "No arguments yet. The hosted action appears after the provider finishes."
                : "No arguments."
            }
            className={cn("bg-card/80", compact ? "max-h-24" : "max-h-40")}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
