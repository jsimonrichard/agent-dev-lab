import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Icon-led pill: the icon is the noun (conversation, workflow, agent), the text is the name. */
export function InspectorNoun({
  icon: Icon,
  noun,
  title,
  className,
  children,
}: {
  icon: LucideIcon;
  noun: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors group-hover:border-border/70 group-hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">{noun} </span>
      <span className="truncate font-mono">{children}</span>
    </span>
  );
}
