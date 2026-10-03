import { cn } from "@/lib/utils";

export const WORKFLOW_ROW_ID = "__workflow__";
export const ROW_DIVIDER = "border-b border-border/40";
/**
 * One border-box height for both panes. The bottom border has to live on the
 * same element as `h-8`; an inner `h-8` plus an outer border is 1px taller
 * and shifts every waterfall row down.
 */
export const PANE_HEADER_CLASS =
  "sticky top-0 z-20 h-8 shrink-0 border-b border-border/40 bg-background";

export const treeControlFocusClass =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** Row background: CSS :hover for the active pane, data-cross-hovered for the synced pane. */
export const rowToneClass = (selected: boolean) =>
  cn(
    "bg-background hover:bg-muted/70 data-[cross-hovered]:bg-muted/70",
    selected && "bg-primary/10 hover:bg-primary/15 data-[cross-hovered]:bg-primary/15",
  );

/**
 * Waterfall rows keep their fill on an inner layer so the shared grid (z-1)
 * paints above the fill and below the bars (z-2). The button itself must not
 * take a z-index, or it would trap the bars under the grid.
 */
export const waterfallToneClass = (selected: boolean) =>
  cn(
    "bg-background group-hover:bg-muted/70 group-data-[cross-hovered]:bg-muted/70",
    selected && "bg-primary/10 group-hover:bg-primary/15 group-data-[cross-hovered]:bg-primary/15",
  );
