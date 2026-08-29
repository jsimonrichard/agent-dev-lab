"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type OnChangeFn,
  type Row,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Filter, Maximize2, MoreHorizontal, Settings2 } from "lucide-react";
import type { LoggedRunEvent } from "@agent-dev-lab/core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  agentSessionByCallId,
  eventLogCellLabel,
  eventLogLinkForField,
  eventLogLinkUnavailableReason,
  formatEventLogTime,
  isEventLogObjectLabelField,
  workflowIdByRunId,
  type EventLogObjectLabels,
  type EventLogResolveContext,
} from "@/lib/event-log/event-log-summary";
import { eventLogFilterCellValue } from "@/lib/event-log/event-log-filter";
import {
  EVENT_LOG_TABLE_COLUMNS,
  eventLogHiddenCells,
  eventLogTableCell,
  isEventLogTableField,
  type EventLogTableField,
} from "@/lib/event-log/event-log-table";
import { cn } from "@/lib/utils";
import { agentRunSearch } from "@/lib/agent/agent-location";
import { workflowRunSearch } from "@/lib/workflow/workflow-location";

export const eventLogTableFeatures = tableFeatures({
  columnVisibilityFeature,
});

export type EventLogTableFeatures = typeof eventLogTableFeatures;

export type EventLogReactTable = ReturnType<typeof useEventLogTable>;

const columnHelper = createColumnHelper<EventLogTableFeatures, LoggedRunEvent>();

/** Matches `h-9` rows. Fixed size avoids measure thrash while scrolling. */
const EVENT_LOG_ROW_HEIGHT = 36;
/** Extra mounted rows above/below the viewport so fast scrolling does not flash blanks. */
const EVENT_LOG_ROW_OVERSCAN = 64;
/** Keep rows that just left the overscan window mounted until scrolling has been idle. */
const EVENT_LOG_ROW_UNMOUNT_DELAY_MS = 800;

export function useEventLogTable({
  rows,
  columnVisibility,
  onColumnVisibilityChange,
  hiddenColumnIds,
  activeEquals,
  workflowIds,
  agentSessions,
  objectLabels,
  registeredWorkflowIds,
  registeredAgentIds,
  onOpenJson,
}: {
  rows: LoggedRunEvent[];
  columnVisibility: ColumnVisibilityState;
  onColumnVisibilityChange: OnChangeFn<ColumnVisibilityState>;
  hiddenColumnIds: EventLogTableField[];
  activeEquals: Set<string>;
  workflowIds: ReturnType<typeof workflowIdByRunId>;
  agentSessions: ReturnType<typeof agentSessionByCallId>;
  objectLabels: EventLogObjectLabels;
  registeredWorkflowIds: ReadonlySet<string>;
  registeredAgentIds: ReadonlySet<string>;
  onOpenJson: (logSeq: number) => void;
}) {
  const activeEqualsRef = useRef(activeEquals);
  const workflowIdsRef = useRef(workflowIds);
  const agentSessionsRef = useRef(agentSessions);
  const objectLabelsRef = useRef(objectLabels);
  const registeredWorkflowIdsRef = useRef(registeredWorkflowIds);
  const registeredAgentIdsRef = useRef(registeredAgentIds);
  const hiddenColumnIdsRef = useRef(hiddenColumnIds);
  const onOpenJsonRef = useRef(onOpenJson);
  activeEqualsRef.current = activeEquals;
  workflowIdsRef.current = workflowIds;
  agentSessionsRef.current = agentSessions;
  objectLabelsRef.current = objectLabels;
  registeredWorkflowIdsRef.current = registeredWorkflowIds;
  registeredAgentIdsRef.current = registeredAgentIds;
  hiddenColumnIdsRef.current = hiddenColumnIds;
  onOpenJsonRef.current = onOpenJson;

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...EVENT_LOG_TABLE_COLUMNS.map((column) =>
          columnHelper.accessor(
            (entry) =>
              eventLogTableCell(entry, column.field, {
                workflowIds: workflowIdsRef.current,
                agentSessions: agentSessionsRef.current,
              })?.filterValue ?? "",
            {
              id: column.field,
              header: column.label,
              cell: ({ row }) => {
                const resolve = {
                  workflowIds: workflowIdsRef.current,
                  agentSessions: agentSessionsRef.current,
                };
                const cell = eventLogTableCell(row.original, column.field, resolve);
                const link = eventLogLinkForField(
                  column.field,
                  row.original.event,
                  workflowIdsRef.current,
                  agentSessionsRef.current,
                );
                const filterValue = eventLogFilterCellValue(row.original, column.field, resolve);
                return (
                  <EventLogCell
                    field={column.field}
                    cell={cell}
                    objectLabels={objectLabelsRef.current}
                    active={activeEqualsRef.current.has(`${column.field}\0${filterValue}`)}
                    link={link}
                    unavailableReason={
                      link
                        ? eventLogLinkUnavailableReason(
                            link,
                            registeredWorkflowIdsRef.current,
                            registeredAgentIdsRef.current,
                          )
                        : null
                    }
                  />
                );
              },
            },
          ),
        ),
        columnHelper.display({
          id: "actions",
          enableHiding: false,
          header: () => <EventLogViewAllFieldsHeader />,
          cell: ({ row }) => (
            <EventLogRowActions
              entry={row.original}
              hiddenColumnIds={hiddenColumnIdsRef.current}
              resolve={{
                workflowIds: workflowIdsRef.current,
                agentSessions: agentSessionsRef.current,
              }}
              onOpenJson={() => onOpenJsonRef.current(row.original.logSeq)}
            />
          ),
        }),
      ]),
    [],
  );

  return useTable({
    features: eventLogTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => String(row.logSeq),
    state: { columnVisibility },
    onColumnVisibilityChange,
  });
}

function EventLogColumnVisibilityChoices({
  table,
  presentFields,
  CheckboxItem,
}: {
  table: EventLogReactTable;
  presentFields: ReadonlySet<EventLogTableField>;
  CheckboxItem: typeof DropdownMenuCheckboxItem | typeof ContextMenuCheckboxItem;
}) {
  const hideable = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && presentFields.has(column.id as EventLogTableField));
  if (hideable.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">No fields in this table.</p>;
  }
  return hideable.map((column) => (
    <CheckboxItem
      key={column.id}
      className="font-mono text-xs"
      checked={column.getIsVisible()}
      onCheckedChange={(value) => column.toggleVisibility(!!value)}
    >
      {column.id}
    </CheckboxItem>
  ));
}

export function EventLogColumnToggle({
  table,
  presentFields,
  hiddenCount,
}: {
  table: EventLogReactTable;
  presentFields: ReadonlySet<EventLogTableField>;
  hiddenCount: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={hiddenCount > 0 ? `Columns, ${hiddenCount} hidden` : "Toggle columns"}
        >
          <Settings2 />
          Columns
          {hiddenCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 font-mono text-[10px]">
              {hiddenCount} hidden
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <EventLogColumnVisibilityChoices
          table={table}
          presentFields={presentFields}
          CheckboxItem={DropdownMenuCheckboxItem}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useHeldVirtualRowRange(
  liveStart: number | undefined,
  liveEnd: number | undefined,
  isScrolling: boolean,
  resetKey: string,
): { start: number; end: number } | null {
  const [held, setHeld] = useState<{ key: string; start: number; end: number } | null>(null);

  useEffect(() => {
    if (liveStart == null || liveEnd == null) {
      setHeld(null);
      return;
    }
    setHeld((prev) => {
      if (!prev || prev.key !== resetKey) {
        return { key: resetKey, start: liveStart, end: liveEnd };
      }
      if (prev.start <= liveStart && prev.end >= liveEnd) {
        return prev;
      }
      return {
        key: resetKey,
        start: Math.min(prev.start, liveStart),
        end: Math.max(prev.end, liveEnd),
      };
    });
  }, [liveEnd, liveStart, resetKey]);

  useEffect(() => {
    if (isScrolling || liveStart == null || liveEnd == null) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setHeld((prev) => {
        if (!prev || prev.key !== resetKey) {
          return prev;
        }
        if (prev.start === liveStart && prev.end === liveEnd) {
          return prev;
        }
        return { key: resetKey, start: liveStart, end: liveEnd };
      });
    }, EVENT_LOG_ROW_UNMOUNT_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [isScrolling, liveEnd, liveStart, resetKey]);

  if (!held || held.key !== resetKey) {
    return liveStart == null || liveEnd == null ? null : { start: liveStart, end: liveEnd };
  }
  return { start: held.start, end: held.end };
}

export function EventLogDataTable({
  table,
  presentFields,
  scrollElement,
  resolve,
  onFilter,
  onOpenJson,
}: {
  table: EventLogReactTable;
  presentFields: ReadonlySet<EventLogTableField>;
  scrollElement: HTMLDivElement | null;
  resolve?: EventLogResolveContext;
  onFilter: (field: string, value: string) => void;
  onOpenJson: (logSeq: number) => void;
}) {
  const contextFieldRef = useRef<EventLogTableField | null>(null);
  const contextSeqRef = useRef<number | null>(null);
  const [menuField, setMenuField] = useState<EventLogTableField | null>(null);
  const [menuSeq, setMenuSeq] = useState<number | null>(null);
  const rows = table.getRowModel().rows;
  const menuEntry =
    menuSeq == null
      ? null
      : (rows.find((row) => row.original.logSeq === menuSeq)?.original ?? null);
  const colSpan = Math.max(1, table.getHeaderGroups()[0]?.headers.length ?? 1);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => EVENT_LOG_ROW_HEIGHT,
    overscan: EVENT_LOG_ROW_OVERSCAN,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const liveStart = virtualRows[0]?.index;
  const liveEnd = virtualRows[virtualRows.length - 1]?.index;
  const resetKey = `${rows.length}:${rows[0]?.id ?? ""}:${rows[rows.length - 1]?.id ?? ""}`;
  const heldRange = useHeldVirtualRowRange(liveStart, liveEnd, virtualizer.isScrolling, resetKey);
  const renderStart = heldRange?.start ?? liveStart ?? 0;
  const renderEnd = heldRange?.end ?? liveEnd ?? -1;
  const paddingTop = renderStart > 0 ? renderStart * EVENT_LOG_ROW_HEIGHT : 0;
  const paddingBottom =
    renderEnd >= 0
      ? Math.max(0, virtualizer.getTotalSize() - (renderEnd + 1) * EVENT_LOG_ROW_HEIGHT)
      : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Table className="min-w-280 border-separate border-spacing-0">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "sticky top-0 z-10 h-8 border-b bg-background px-3 py-2 font-mono text-[10px] font-medium",
                        header.column.id === "actions" ? "text-right" : null,
                      )}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuLabel>Toggle columns</ContextMenuLabel>
            <ContextMenuSeparator />
            <EventLogColumnVisibilityChoices
              table={table}
              presentFields={presentFields}
              CheckboxItem={ContextMenuCheckboxItem}
            />
          </ContextMenuContent>
        </ContextMenu>
        <ContextMenu
          onOpenChange={(open) => {
            setMenuField(open ? contextFieldRef.current : null);
            setMenuSeq(open ? contextSeqRef.current : null);
          }}
        >
          <ContextMenuTrigger asChild>
            <TableBody
              onContextMenuCapture={(event) => {
                const target = event.target as HTMLElement | null;
                const fieldEl = target?.closest("[data-event-log-field]");
                const rowEl = target?.closest("tr[data-log-seq]");
                const field = fieldEl?.getAttribute("data-event-log-field");
                const seq = rowEl?.getAttribute("data-log-seq");
                contextFieldRef.current = isEventLogTableField(field) ? field : null;
                contextSeqRef.current = seq ? Number(seq) : null;
              }}
            >
              {paddingTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colSpan} className="p-0" style={{ height: paddingTop }} />
                </tr>
              ) : null}
              {renderEnd >= renderStart
                ? Array.from({ length: renderEnd - renderStart + 1 }, (_, offset) => {
                    const row = rows[renderStart + offset];
                    if (!row) {
                      return null;
                    }
                    return <EventLogTableRow key={row.id} row={row} table={table} />;
                  })
                : null}
              {paddingBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colSpan} className="p-0" style={{ height: paddingBottom }} />
                </tr>
              ) : null}
            </TableBody>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              disabled={menuField == null || menuEntry == null}
              onSelect={() => {
                const field = contextFieldRef.current;
                const entry = menuEntry;
                if (!field || !entry) {
                  return;
                }
                onFilter(field, eventLogFilterCellValue(entry, field, resolve));
              }}
            >
              <Filter />
              Filter by this
            </ContextMenuItem>
            <ContextMenuItem
              disabled={menuSeq == null}
              onSelect={() => {
                if (menuSeq != null) {
                  onOpenJson(menuSeq);
                }
              }}
            >
              <Maximize2 />
              Open JSON
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Table>
    </TooltipProvider>
  );
}

const EventLogTableRow = memo(function EventLogTableRow({
  row,
  table,
}: {
  row: Row<EventLogTableFeatures, LoggedRunEvent>;
  table: EventLogReactTable;
}) {
  return (
    <TableRow data-log-seq={row.original.logSeq} className="h-9 transition-none">
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn("px-1.5 py-0.5", cell.column.id === "actions" ? "text-right" : null)}
          data-event-log-field={isEventLogTableField(cell.column.id) ? cell.column.id : undefined}
        >
          <table.FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
});

function EventLogViewAllFieldsHeader() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help text-muted-foreground">
          <MoreHorizontal className="size-3" />
          <span className="sr-only">View all fields</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>View all fields</TooltipContent>
    </Tooltip>
  );
}

function EventLogRowActions({
  entry,
  hiddenColumnIds,
  resolve,
  onOpenJson,
}: {
  entry: LoggedRunEvent;
  hiddenColumnIds: EventLogTableField[];
  resolve: EventLogResolveContext;
  onOpenJson: () => void;
}) {
  const hiddenCells = eventLogHiddenCells(entry, hiddenColumnIds, resolve);
  const label =
    hiddenCells.length > 0
      ? `View all fields for ${entry.event.type}, ${hiddenCells.length} hidden`
      : `View all fields for ${entry.event.type}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="relative"
          aria-label={label}
          onClick={onOpenJson}
        >
          <MoreHorizontal />
          {hiddenCells.length > 0 ? (
            <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>View all fields</TooltipContent>
    </Tooltip>
  );
}

function eventLogCellTitle(display: string, filterValue: string): string {
  return display !== filterValue ? `${display} (${filterValue})` : filterValue;
}

function EventLogCell({
  field,
  cell,
  objectLabels,
  active,
  link,
  unavailableReason,
}: {
  field: EventLogTableField;
  cell: ReturnType<typeof eventLogTableCell>;
  objectLabels: EventLogObjectLabels;
  active: boolean;
  link: ReturnType<typeof eventLogLinkForField>;
  unavailableReason: string | null;
}) {
  const display = cell
    ? field === "at"
      ? formatEventLogTime(cell.filterValue)
      : eventLogCellLabel(cell, objectLabels)
    : "—";
  const named = Boolean(cell && isEventLogObjectLabelField(field) && display !== cell.filterValue);
  const className = cn(
    "block truncate rounded-sm px-1.5 py-1 text-[11px]",
    field === "at" ? "max-w-56" : "max-w-44",
    named ? null : "font-mono",
    field === "logSeq" || field === "seq" || field === "at" ? "tabular-nums" : null,
    active && "bg-accent",
    !cell && "text-muted-foreground/40",
  );

  if (link && cell && unavailableReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              className,
              "cursor-help text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            {display}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{unavailableReason}</TooltipContent>
      </Tooltip>
    );
  }

  if (link?.kind === "workflow-run" && cell) {
    return (
      <Link
        className={cn(
          className,
          "text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        to="/workflows/$workflowId/run/$runId"
        params={{ workflowId: link.workflowId, runId: link.runId }}
        search={workflowRunSearch({ step: link.stepId })}
        title={eventLogCellTitle(display, cell.filterValue)}
      >
        {display}
      </Link>
    );
  }

  if (link?.kind === "workflow" && cell) {
    return (
      <Link
        className={cn(
          className,
          "text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        to="/workflows/$workflowId"
        params={{ workflowId: link.workflowId }}
        title={eventLogCellTitle(display, cell.filterValue)}
      >
        {display}
      </Link>
    );
  }

  if (link?.kind === "agent-call" && cell) {
    return (
      <Link
        className={cn(
          className,
          "text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        to="/agent/$agentId/run/$runId"
        params={{ agentId: link.agentId, runId: link.memoryScope }}
        search={agentRunSearch({ call: link.agentCallId })}
        title={eventLogCellTitle(display, cell.filterValue)}
      >
        {display}
      </Link>
    );
  }

  if (link?.kind === "conversation" && cell) {
    return (
      <Link
        className={cn(
          className,
          "text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        to="/agent/$agentId/run/$runId"
        params={{ agentId: link.agentId, runId: link.memoryScope }}
        search={agentRunSearch({})}
        title={eventLogCellTitle(display, cell.filterValue)}
      >
        {display}
      </Link>
    );
  }

  if (link?.kind === "agent" && cell) {
    return (
      <Link
        className={cn(
          className,
          "text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        to="/agent/$agentId"
        params={{ agentId: link.agentId }}
        title={eventLogCellTitle(display, cell.filterValue)}
      >
        {display}
      </Link>
    );
  }

  return (
    <span
      className={className}
      title={cell ? eventLogCellTitle(display, cell.filterValue) : undefined}
    >
      {display}
    </span>
  );
}
