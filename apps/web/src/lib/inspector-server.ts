import { createServerFn } from "@tanstack/react-start";

import {
  forkAgentFromWorkflow,
  getProjectInspectorMeta,
  getWorkflowRunSummary,
  getWorkflowRunUiEvents,
  listWorkflowRunSummaries,
  loadMessagesForScope,
  resolveAgentConversation,
  startAgentTurn,
  startWorkflowRun,
  createStandaloneAgentSession,
  listAgentSessionsForUi,
} from "#/lib/run-service";

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
  .validator((payload: { workflowId: string; input?: unknown }) => payload)
  .handler(async ({ data }) => {
    return startWorkflowRun(data.workflowId, data.input ?? {});
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
      messages: { id: string; role: "system" | "user" | "assistant"; content: string }[];
    }) => payload,
  )
  .handler(async ({ data }) => {
    return forkAgentFromWorkflow(data);
  });

export const createAgentSession = createServerFn({ method: "POST" })
  .validator((agentId: string) => agentId)
  .handler(async ({ data: agentId }) => {
    return createStandaloneAgentSession(agentId);
  });

export const fetchMessagesForScope = createServerFn({ method: "GET" })
  .validator((memoryScope: string) => memoryScope)
  .handler(async ({ data: memoryScope }) => {
    return loadMessagesForScope(memoryScope);
  });
