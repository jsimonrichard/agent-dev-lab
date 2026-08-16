import { createServerFn } from "@tanstack/react-start";

import type { MockMessage } from "#/lib/mock/types";

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
} from "#/lib/run-service.server";

export const fetchProjectMeta = createServerFn({ method: "GET" }).handler(async () => {
  return getProjectInspectorMeta();
});

export const fetchWorkflowRuns = createServerFn({ method: "GET" }).handler(async () => {
  return listWorkflowRunSummaries();
});

export const fetchWorkflowRun = createServerFn({ method: "GET" })
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
    try {
      return await startWorkflowRun(data.workflowId, data.input ?? {}, data.title);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  });

export const cancelInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return cancelWorkflowRun(runId);
  });

export const fetchAgentConversation = createServerFn({ method: "GET" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return resolveAgentConversation(memoryScope);
  });

export const fetchAgentSessions = createServerFn({ method: "GET" }).handler(async () => {
  return listAgentSessionsForUi();
});

export const sendAgentMessage = createServerFn({ method: "POST" })
  .validator((payload: { agentId: string; memoryScope: string; user: string }) => payload)
  .handler(async ({ data }) => {
    return startAgentTurn({
      agentId: data.agentId,
      memoryScope: data.memoryScope,
      user: data.user,
    });
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
      messages: MockMessage[];
    }) => payload,
  )
  .handler(async ({ data }) => {
    return forkAgentFromWorkflow(data);
  });

export const forkLinkedConversation = createServerFn({ method: "POST" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return forkLinkedAgentConversation(memoryScope);
  });

export const createAgentSession = createServerFn({ method: "POST" })
  .validator((agentId: string) => agentId)
  .handler(async ({ data: agentId }) => {
    return createStandaloneAgentSession(agentId);
  });

export const renameAgentConversation = createServerFn({ method: "POST" })
  .validator((payload: { memoryScope: string; title: string }) => payload)
  .handler(async ({ data }) => {
    return renameAgentSession(data.memoryScope, data.title);
  });

export const deleteAgentConversation = createServerFn({ method: "POST" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return deleteAgentSession(memoryScope);
  });

export const renameInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((payload: { runId: string; title: string }) => payload)
  .handler(async ({ data }) => {
    return renameWorkflowRun(data.runId, data.title);
  });

export const deleteInspectionWorkflowRun = createServerFn({ method: "POST" })
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return deleteWorkflowRun(runId);
  });

export const fetchMessagesForScope = createServerFn({ method: "GET" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return loadMessagesForScope(memoryScope);
  });

export const fetchMessagesForWorkflowRun = createServerFn({ method: "GET" })
  .validator((runId: string) => runId)
  .handler(async ({ data: runId }) => {
    return loadMessagesForWorkflowRun(runId);
  });
