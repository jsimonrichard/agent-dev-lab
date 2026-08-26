import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Trash2, X } from "lucide-react";
import type { LoggedRunEvent } from "@agent-dev-lab/core";
import type { ColumnVisibilityState, Updater } from "@tanstack/react-table";

import {
  EventLogColumnToggle,
  EventLogDataTable,
  useEventLogTable,
} from "@/components/app/event-log-data-table";
import { JsonPreview } from "@/components/app/json-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { useProcessEventLog } from "@/hooks/use-process-event-log";
import { sessionDisplayTitle } from "@/lib/agent-sessions";
import {
  DEFAULT_EVENT_LOG_FILTERS,
  collectFieldKinds,
  createFilterClause,
  eventLogDefaultFilterOp,
  eventLogEnumFilterOptions,
  eventLogFilterOpNeedsValue,
  eventLogFilterOpsForField,
  filterLoggedEvents,
  formatFilterClause,
  isEventLogFilterOpAllowed,
  type EventLogFilterClause,
  type EventLogFilterOp,
  type EventLogFilterState,
} from "@/lib/event-log-filter";
import {
  DEFAULT_EVENT_LOG_PAGE_SIZE,
  EVENT_LOG_PAGE_SIZES,
  eventLogPageWindow,
  isEventLogPageSize,
} from "@/lib/event-log-page";
import { type EventLogSnapshotEntry, loggedRunEventsFromSnapshot } from "@/lib/event-log-snapshot";
import {
  agentSessionByCallId,
  EVENT_LOG_FILTER_ABSENT,
  eventLogObjectLabels,
  isEventLogObjectLabelField,
  workflowIdByRunId,
} from "@/lib/event-log-summary";
import {
  eventLogColumnVisibility,
  eventLogFilterFieldList,
  eventLogHiddenColumnIds,
  eventLogPresentFields,
  eventLogRowHiddenColumnIds,
  eventLogUserColumnVisibility,
} from "@/lib/event-log-table";
import { clearEventLog } from "#/lib/inspector-server";

function namedFilterPlaceholder(field: string): { select: string; empty: string } {
  switch (field) {
    case "workflow":
      return { select: "Select a workflow", empty: "No workflows in this log." };
    case "workflowRun":
      return { select: "Select a workflow run", empty: "No workflow runs in this log." };
    case "agent":
      return { select: "Select an agent", empty: "No agents in this log." };
    case "conversation":
      return { select: "Select a conversation", empty: "No conversations in this log." };
    case "agentCall":
      return { select: "Select an agent call", empty: "No agent calls in this log." };
    case "stepId":
      return { select: "Select a step", empty: "No steps in this log." };
    case "type":
      return { select: "Select an event type", empty: "No event types in this log." };
    default:
      return { select: "Select a value", empty: "No values in this log." };
  }
}

export function EventLogWorkspace({ initialEvents }: { initialEvents: EventLogSnapshotEntry[] }) {
  const { events, setEvents } = useProcessEventLog(loggedRunEventsFromSnapshot(initialEvents));
  const { project, runs, sessions } = useAppLoaderData();
  const [filters, setFilters] = useState<EventLogFilterState>(DEFAULT_EVENT_LOG_FILTERS);
  const [paused, setPaused] = useState(false);
  const [pausedSnapshot, setPausedSnapshot] = useState<LoggedRunEvent[] | null>(null);
  const [detailSeq, setDetailSeq] = useState<number | null>(null);
  const [draftField, setDraftField] = useState("type");
  const [draftOp, setDraftOp] = useState<EventLogFilterOp>("equals");
  const [draftValue, setDraftValue] = useState("");
  const [stickToLive, setStickToLive] = useState(true);
  const [pageSize, setPageSize] = useState(DEFAULT_EVENT_LOG_PAGE_SIZE);
  const [page, setPage] = useState(0);
  const [userColumnVisibility, setUserColumnVisibility] = useState<ColumnVisibilityState>({});
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  const source = paused && pausedSnapshot ? pausedSnapshot : events;
  const workflowIds = useMemo(() => workflowIdByRunId(events), [events]);
  const agentSessions = useMemo(() => agentSessionByCallId(events), [events]);
  const resolve = useMemo(() => ({ workflowIds, agentSessions }), [agentSessions, workflowIds]);
  const matched = useMemo(
    () => filterLoggedEvents(source, filters, resolve),
    [filters, resolve, source],
  );
  const filterFields = useMemo(() => eventLogFilterFieldList(source), [source]);
  const fieldKinds = useMemo(
    () => collectFieldKinds(source, undefined, resolve),
    [resolve, source],
  );
  const draftOps = useMemo(
    () => eventLogFilterOpsForField(draftField, fieldKinds),
    [draftField, fieldKinds],
  );
  const draftOpAllowed = draftOps.some((item) => item.op === draftOp)
    ? draftOp
    : eventLogDefaultFilterOp(draftField, fieldKinds);
  const objectLabels = useMemo(
    () =>
      eventLogObjectLabels(source, {
        runs,
        sessions: sessions.map((session) => ({
          agentCallId: session.agentCallId,
          agentId: session.agentId,
          memoryScope: session.memoryScope,
          title: sessionDisplayTitle(session),
        })),
      }),
    [runs, sessions, source],
  );
  const namedValueOptions = useMemo(
    () => eventLogEnumFilterOptions(source, draftField, objectLabels, resolve, fieldKinds),
    [draftField, fieldKinds, objectLabels, resolve, source],
  );
  const registeredWorkflowIds = useMemo(() => new Set(project.workflowIds), [project.workflowIds]);
  const registeredAgentIds = useMemo(() => new Set(project.agentIds), [project.agentIds]);
  const pageWindow = useMemo(
    () => eventLogPageWindow(matched, page, pageSize),
    [matched, page, pageSize],
  );
  const detail = useMemo(
    () => (detailSeq == null ? null : (events.find((entry) => entry.logSeq === detailSeq) ?? null)),
    [detailSeq, events],
  );
  const activeEquals = useMemo(() => {
    const keys = new Set<string>();
    for (const clause of filters.clauses) {
      if (clause.op === "equals") {
        keys.add(`${clause.field}\0${clause.value}`);
      }
    }
    return keys;
  }, [filters.clauses]);
  const presentFields = useMemo(() => eventLogPresentFields(matched, resolve), [matched, resolve]);
  const columnVisibility = useMemo(
    () => eventLogColumnVisibility(userColumnVisibility, presentFields),
    [presentFields, userColumnVisibility],
  );
  const hiddenColumnIds = useMemo(
    () => eventLogHiddenColumnIds(userColumnVisibility, presentFields),
    [presentFields, userColumnVisibility],
  );
  const rowHiddenColumnIds = useMemo(
    () => eventLogRowHiddenColumnIds(hiddenColumnIds),
    [hiddenColumnIds],
  );

  const onColumnVisibilityChange = useCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      setUserColumnVisibility((current) => {
        const resolved = eventLogColumnVisibility(current, presentFields);
        const next = typeof updater === "function" ? updater(resolved) : updater;
        return eventLogUserColumnVisibility(next, presentFields);
      });
    },
    [presentFields],
  );

  const table = useEventLogTable({
    rows: pageWindow.slice,
    columnVisibility,
    onColumnVisibilityChange,
    hiddenColumnIds: rowHiddenColumnIds,
    activeEquals,
    workflowIds,
    agentSessions,
    objectLabels,
    registeredWorkflowIds,
    registeredAgentIds,
    onOpenJson: setDetailSeq,
  });

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(matched.length / pageSize) - 1);
    if (!paused && stickToLive) {
      setPage(0);
      return;
    }
    setPage((current) => Math.min(current, lastPage));
  }, [matched.length, pageSize, paused, stickToLive]);

  // Jump to the top only when the page window changes. Follow-live must not
  // write scrollTop — new rows already insert at the top, and snapping to 0 on
  // every event (or when unfollow toggles) fights the user and flashes rows.
  useEffect(() => {
    if (!scrollElement) {
      return;
    }
    scrollElement.scrollTop = 0;
  }, [pageWindow.page, pageSize, scrollElement]);

  function onScroll() {
    if (!scrollElement) {
      return;
    }
    if (pageWindow.page === 0) {
      setStickToLive(scrollElement.scrollTop < 64);
    }
  }

  function scrollToTop() {
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
  }

  const needsValue = eventLogFilterOpNeedsValue(draftOpAllowed);
  const onFirstPage = pageWindow.page <= 0;
  const onLastPage = pageWindow.page >= pageWindow.totalPages - 1;

  function addClause(clause: Omit<EventLogFilterClause, "id">) {
    setFilters((prev) => {
      if (
        prev.clauses.some(
          (existing) =>
            existing.field === clause.field &&
            existing.op === clause.op &&
            existing.value === clause.value,
        )
      ) {
        return prev;
      }
      return { ...prev, clauses: [...prev.clauses, createFilterClause(clause)] };
    });
  }

  function filterEquals(field: string, value: string) {
    addClause({ field, op: "equals", value });
  }

  function removeClause(id: string) {
    setFilters((prev) => ({
      ...prev,
      clauses: prev.clauses.filter((clause) => clause.id !== id),
    }));
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const field = draftField.trim();
    if (!field) {
      return;
    }
    if (needsValue && namedValueOptions && !draftValue) {
      return;
    }
    if (!isEventLogFilterOpAllowed(field, draftOpAllowed, fieldKinds)) {
      return;
    }
    addClause({ field, op: draftOpAllowed, value: draftValue });
    setDraftValue("");
  }

  function formatClause(clause: EventLogFilterClause): string {
    const display = isEventLogObjectLabelField(clause.field)
      ? (objectLabels[clause.field].get(clause.value) ?? clause.value)
      : undefined;
    return formatFilterClause(clause, display);
  }

  function togglePaused() {
    if (paused) {
      setPaused(false);
      setPausedSnapshot(null);
      setStickToLive(true);
      scrollToTop();
      return;
    }
    setPausedSnapshot(events);
    setPaused(true);
  }

  async function onClear() {
    await clearEventLog();
    setEvents([]);
    setPausedSnapshot(null);
    setPaused(false);
    setDetailSeq(null);
    setPage(0);
    setStickToLive(true);
  }

  function goOlder() {
    setStickToLive(false);
    setPage((current) => Math.min(pageWindow.totalPages - 1, current + 1));
  }

  function goNewer() {
    const next = Math.max(0, pageWindow.page - 1);
    setPage(next);
    if (next === 0) {
      setStickToLive(true);
      scrollToTop();
    }
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-sm font-semibold">Event log</h1>
        <Badge variant={paused ? "outline" : "default"} className="capitalize">
          {paused ? "paused" : "live"}
        </Badge>
        <p className="hidden text-xs text-muted-foreground sm:block">
          In-memory tail, hydrated from persisted runs on startup.
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {matched.length}/{source.length}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={togglePaused}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void onClear()}>
            <Trash2 />
            Clear
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={submitDraft}>
          <div className="min-w-40 flex-1">
            <Label htmlFor="event-log-query" className="mb-1 text-[10px] text-muted-foreground">
              Search any field
            </Label>
            <Input
              id="event-log-query"
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
              placeholder="Substring match"
              className="h-8 text-xs"
            />
          </div>
          <div className="w-52">
            <Label htmlFor="event-log-field" className="mb-1 text-[10px] text-muted-foreground">
              Field
            </Label>
            <Select
              value={draftField}
              onValueChange={(value) => {
                setDraftField(value);
                setDraftValue("");
                if (!isEventLogFilterOpAllowed(value, draftOp, fieldKinds)) {
                  setDraftOp(eventLogDefaultFilterOp(value, fieldKinds));
                }
              }}
            >
              <SelectTrigger id="event-log-field" size="sm" className="w-full font-mono text-xs">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent align="start" className="max-h-72">
                <SelectGroup>
                  <SelectLabel>Columns</SelectLabel>
                  {filterFields.columns.map((field) => (
                    <SelectItem key={field} value={field} className="font-mono text-xs">
                      {field}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {filterFields.extra.length > 0 ? (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Other fields</SelectLabel>
                      {filterFields.extra.map((field) => (
                        <SelectItem key={field} value={field} className="font-mono text-xs">
                          {field}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label htmlFor="event-log-op" className="mb-1 text-[10px] text-muted-foreground">
              Operator
            </Label>
            <Select
              value={draftOpAllowed}
              onValueChange={(value) => setDraftOp(value as EventLogFilterOp)}
            >
              <SelectTrigger id="event-log-op" size="sm" className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {draftOps.map((item) => (
                  <SelectItem key={item.op} value={item.op} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsValue ? (
            <div className="min-w-40 flex-1">
              <Label htmlFor="event-log-value" className="mb-1 text-[10px] text-muted-foreground">
                Value
              </Label>
              {namedValueOptions ? (
                <Select value={draftValue || undefined} onValueChange={setDraftValue}>
                  <SelectTrigger id="event-log-value" size="sm" className="w-full text-xs">
                    <SelectValue placeholder={namedFilterPlaceholder(draftField).select} />
                  </SelectTrigger>
                  <SelectContent align="start" className="max-h-72">
                    {namedValueOptions.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        {namedFilterPlaceholder(draftField).empty}
                      </p>
                    ) : (
                      namedValueOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="text-xs"
                          title={
                            option.value === EVENT_LOG_FILTER_ABSENT || option.value === "null"
                              ? undefined
                              : option.label !== option.value
                                ? `${option.label} (${option.value})`
                                : option.value
                          }
                        >
                          {option.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="event-log-value"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  placeholder="value"
                  className="h-8 text-xs"
                />
              )}
            </div>
          ) : null}
          <Button type="submit" size="sm">
            Add filter
          </Button>
          {filters.clauses.length > 0 || filters.query ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ clauses: [], query: "" })}
            >
              Clear filters
            </Button>
          ) : null}
        </form>
        {filters.clauses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filters.clauses.map((clause) => (
              <Badge key={clause.id} variant="secondary" className="gap-1 pr-1">
                <span className="font-mono text-[10px]">{formatClause(clause)}</span>
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove filter ${formatClause(clause)}`}
                  onClick={() => removeClause(clause.id)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Click a name to open that run, conversation, call, or step. ⋯ opens JSON. Right-click a
            value to filter. Right-click the header to show or hide columns.
          </p>
          <EventLogColumnToggle
            table={table}
            presentFields={presentFields}
            hiddenCount={hiddenColumnIds.length}
          />
        </div>
      </div>

      <div
        ref={setScrollElement}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
      >
        {matched.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            {source.length === 0
              ? "No events yet. Start a workflow or agent conversation to see the live log."
              : "No events match the current filters."}
          </p>
        ) : (
          <EventLogDataTable
            table={table}
            presentFields={presentFields}
            scrollElement={scrollElement}
            resolve={resolve}
            onFilter={filterEquals}
            onOpenJson={setDetailSeq}
          />
        )}
      </div>

      <footer className="flex h-12 shrink-0 items-center gap-3 border-t border-border px-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          {pageWindow.total === 0
            ? "0 events"
            : `${pageWindow.from}–${pageWindow.to} of ${pageWindow.total.toLocaleString()}`}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="event-log-page-size" className="text-[10px] text-muted-foreground">
            Per page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const next = Number(value);
              if (isEventLogPageSize(next)) {
                setPageSize(next);
              }
            }}
          >
            <SelectTrigger id="event-log-page-size" size="sm" className="w-20 text-xs tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {EVENT_LOG_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)} className="tabular-nums">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Newer events"
            disabled={onFirstPage || pageWindow.total === 0}
            onClick={goNewer}
          >
            <ChevronLeft />
          </Button>
          <p className="min-w-14 text-center text-xs text-muted-foreground tabular-nums">
            {pageWindow.page + 1}/{pageWindow.totalPages}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Older events"
            disabled={onLastPage || pageWindow.total === 0}
            onClick={goOlder}
          >
            <ChevronRight />
          </Button>
        </div>
      </footer>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSeq(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(85vh,48rem)] min-h-0 w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0 pr-8 text-left">
            <DialogTitle className="font-mono text-base">
              {detail?.event.type ?? "Event"}
            </DialogTitle>
            <DialogDescription>Complete RunEvent payload.</DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <JsonPreview value={detail.event} fill expandable={false} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
