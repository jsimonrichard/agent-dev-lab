import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { fromAsyncThrowable } from "@agent-dev-lab/core";

import type { InspectorMessage } from "#/lib/view-model/types";

import {
  forkAgentFromWorkflow,
  forkLinkedAgentConversation,
  getProjectInspectorMeta,
  getWorkflowRunSummary,
  getWorkflowRunUiEvents,
  listWorkflowRunSummaries,
  loadMessagesForScope,
  loadMessagesForWorkflowRun,
  resolveAgentConversation,
  startAgentTurn,
  startWorkflowRun,
  cancelWorkflowRun,
  createStandaloneAgentSession,
  listAgentSessionsForUi,
  renameAgentSession,
  deleteAgentSession,
  renameWorkflowRun,
  deleteWorkflowRun,
  getAgentRunEvents,
} from "#/lib/run-service.server";
import { getAdlRuntime } from "#/lib/adl-runtime.server";
import { snapshotEventLog, getEventLog } from "#/lib/event-log/event-log.server";
import { getCoreShell } from "#/lib/runtime-info.server";

const noStore = createMiddleware({ type: "function" }).client(async ({ next }) => {
  return next({
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
});

export const fetchProjectMeta = createServerFn({ method: "GET" })
  .middleware([noStore])
  .handler(async () => {
    return getProjectInspectorMeta();
  });

export const fetchRuntimeInfo = createServerFn({ method: "GET" })
  .middleware([noStore])
  .handler(async () => {
    return getCoreShell();
  });

export const fetchWorkflowRuns = createServerFn({ method: "GET" })
  .middleware([noStore])
  .handler(async () => {
    return listWorkflowRunSummaries();
  });

export const fetchWorkflowRun = createServerFn({ method: "GET" })
  .middleware([noStore])
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    const summary = await getWorkflowRunSummary(runId);
    if (!summary) {
      return null;
    }
    const events = await getWorkflowRunUiEvents(runId);
    return { summary, events };
  });

export const startInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((payload: { workflowId: string; input?: unknown; title?: string }) => payload)
  .handler(async ({ data }) => {
    return fromAsyncThrowable(() =>
      startWorkflowRun(data.workflowId, data.input ?? {}, data.title),
    );
  });

export const cancelInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return cancelWorkflowRun(runId);
  });

export const fetchAgentConversation = createServerFn({ method: "GET" })
  .middleware([noStore])
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return resolveAgentConversation(memoryScope);
  });

export const fetchAgentCallEvents = createServerFn({ method: "GET" })
  .middleware([noStore])
  .validator((agentCallId: string) => agentCallId)
  .handler(async ({ data: agentCallId }) => {
    const events = await getAgentRunEvents(agentCallId);
    return {
      commits: events
        .filter((event) => event.type === "agent_messages_committed")
        .map((event) => ({ type: event.type, total: event.total, count: event.count })),
      warnings: events
        .filter((event) => event.type === "agent_warning")
        .map((event) => event.message),
    };
  });

export const fetchAgentSessions = createServerFn({ method: "GET" })
  .middleware([noStore])
  .handler(async () => {
    return listAgentSessionsForUi();
  });

export const sendAgentMessage = createServerFn({ method: "POST" })
  .validator((payload: { agentId: string; memoryScope: string; user: string }) => payload)
  .handler(async ({ data }) => {
    return fromAsyncThrowable(() =>
      startAgentTurn({
        agentId: data.agentId,
        memoryScope: data.memoryScope,
        user: data.user,
      }),
    );
  });

export const forkAgentConversation = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      agentId: string;
      sourceWorkflowId: string;
      sourceRunId: string;
      sourceStepId: string;
      sourceEpisodeId: string;
      sourceMemoryScope: string;
      messages: InspectorMessage[];
    }) => payload,
  )
  .handler(async ({ data }) => {
    return fromAsyncThrowable(() => forkAgentFromWorkflow(data));
  });

export const forkLinkedConversation = createServerFn({ method: "POST" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return fromAsyncThrowable(() => forkLinkedAgentConversation(memoryScope));
  });

export const createAgentSession = createServerFn({ method: "POST" })
  .validator((agentId: string) => agentId)
  .handler(async ({ data: agentId }) => {
    return fromAsyncThrowable(() => createStandaloneAgentSession(agentId));
  });

export const renameAgentConversation = createServerFn({ method: "POST" })
  .validator((payload: { memoryScope: string; title: string }) => payload)
  .handler(async ({ data }) => {
    return fromAsyncThrowable(() => renameAgentSession(data.memoryScope, data.title));
  });

export const deleteAgentConversation = createServerFn({ method: "POST" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return fromAsyncThrowable(() => deleteAgentSession(memoryScope));
  });

export const renameInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((payload: { runId: string; title: string }) => payload)
  .handler(async ({ data }) => {
    return fromAsyncThrowable(() => renameWorkflowRun(data.runId, data.title));
  });

export const deleteInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return fromAsyncThrowable(() => deleteWorkflowRun(runId));
  });

export const fetchMessagesForScope = createServerFn({ method: "GET" })
  .middleware([noStore])
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return loadMessagesForScope(memoryScope);
  });

export const fetchMessagesForWorkflowRun = createServerFn({ method: "GET" })
  .middleware([noStore])
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return loadMessagesForWorkflowRun(runId);
  });

export const fetchEventLog = createServerFn({ method: "GET" })
  .middleware([noStore])
  .handler(async () => {
    await getAdlRuntime();
    return snapshotEventLog();
  });

export const clearEventLog = createServerFn({ method: "POST" }).handler(async () => {
  await getAdlRuntime();
  getEventLog().clear();
  return { ok: true as const };
});
