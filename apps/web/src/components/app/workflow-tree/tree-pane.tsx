import { type ReactNode, type RefObject } from "react";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { PANE_HEADER_CLASS, ROW_DIVIDER } from "./constants";

export function StepsHeader() {
  return (
    <div
      className={cn(
        PANE_HEADER_CLASS,
        "flex items-center px-4 text-[10px] font-medium tracking-wide text-muted-foreground uppercase",
      )}
    >
      Steps
    </div>
  );
}

export function WorkflowLoadingPlaceholder() {
  return (
    <div
      className={cn("flex h-9 shrink-0 items-center gap-2 pr-2", ROW_DIVIDER)}
      style={{ paddingLeft: 8 + 16 }}
      aria-busy="true"
      aria-label="Waiting for workflow steps"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function TreePane({
  scrollRef,
  width,
  scrollbarGutter,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  width: number | string;
  scrollbarGutter: number;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 shrink-0 overflow-x-hidden overflow-y-auto scrollbar-none"
      style={{ width }}
    >
      <div className="flex min-h-full flex-col" style={{ paddingBottom: scrollbarGutter }}>
        <StepsHeader />
        {children}
        <div className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
