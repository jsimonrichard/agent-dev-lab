import { describe, expect, it } from "bun:test";

import {
  createMemoryScope,
  formatAgentSessionIdentity,
  getAgentSessionByMemoryScope,
  isWorkflowLinkedConversation,
  registerAgentSession,
  registerAgentSessionFromEvent,
  renameAgentSessionTitle,
  applyGeneratedConversationTitle,
  sessionDisplayTitle,
  setConversationTurnActive,
  isConversationTurnActive,
  unregisterAgentSession,
  workflowRunLocationForSession,
  type AgentSession,
} from "./agent-sessions";

const runs = [{ runId: "run-1", workflowId: "literature-review" }];

function session(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    agentCallId: "call-1",
    agentId: "researcher",
    memoryScope: "conv:1",
    title: "Chat · researcher",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatAgentSessionIdentity", () => {
  it("returns the agent id for standalone chats", () => {
    expect(formatAgentSessionIdentity(session(), runs)).toBe("researcher");
  });

  it("appends the workflow id for in-workflow episodes", () => {
    expect(formatAgentSessionIdentity(session({ workflowRunId: "run-1" }), runs)).toBe(
      "researcher · literature-review",
    );
  });

  it("uses fork provenance when the conversation was forked from a workflow", () => {
    expect(
      formatAgentSessionIdentity(
        session({
          fork: {
            sourceWorkflowId: "literature-review",
            sourceWorkflowRunId: "run-1",
            sourceStepId: "step-1",
            sourceAgentCallId: "call-0",
            sourceMemoryScope: "run-1:notes",
          },
        }),
        [],
      ),
    ).toBe("researcher · literature-review");
  });
});

describe("workflowRunLocationForSession", () => {
  it("is undefined for standalone chats", () => {
    expect(workflowRunLocationForSession(session(), runs)).toBeUndefined();
  });

  it("resolves the workflow run for in-workflow conversations", () => {
    expect(workflowRunLocationForSession(session({ workflowRunId: "run-1" }), runs)).toEqual({
      workflowId: "literature-review",
      runId: "run-1",
    });
  });

  it("is undefined when the linked run is missing from the run list", () => {
    expect(
      workflowRunLocationForSession(session({ workflowRunId: "run-missing" }), runs),
    ).toBeUndefined();
  });

  it("is undefined for conversations forked from a workflow", () => {
    expect(
      workflowRunLocationForSession(
        session({
          fork: {
            sourceWorkflowId: "literature-review",
            sourceWorkflowRunId: "run-1",
            sourceStepId: "step-1",
            sourceAgentCallId: "call-0",
            sourceMemoryScope: "run-1:notes",
          },
        }),
        [],
      ),
    ).toBeUndefined();
  });
});

describe("isWorkflowLinkedConversation", () => {
  it("is false for standalone chats", () => {
    expect(isWorkflowLinkedConversation(session())).toBe(false);
  });

  it("is true for conversations that ran inside a workflow", () => {
    expect(isWorkflowLinkedConversation(session({ workflowRunId: "run-1" }))).toBe(true);
  });

  it("is false for conversations forked from a workflow", () => {
    expect(
      isWorkflowLinkedConversation(
        session({
          fork: {
            sourceWorkflowId: "literature-review",
            sourceWorkflowRunId: "run-1",
            sourceStepId: "step-1",
            sourceAgentCallId: "call-0",
            sourceMemoryScope: "run-1:notes",
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("sessionDisplayTitle", () => {
  it("rewrites generated fork titles that used the episode id", () => {
    expect(
      sessionDisplayTitle(
        session({
          title: "Fork · call-0",
          fork: {
            sourceWorkflowId: "literature-review",
            sourceWorkflowRunId: "run-1",
            sourceStepId: "step-1",
            sourceAgentCallId: "call-0",
            sourceMemoryScope: "run-1:notes",
          },
        }),
      ),
    ).toBe("Fork · notes");
  });
});

describe("createMemoryScope", () => {
  it("is a UUID", () => {
    expect(createMemoryScope()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("rename and delete sessions", () => {
  it("renames the title without changing the memory scope", () => {
    const memoryScope = "conv:rename-keep-id";
    registerAgentSession(session({ memoryScope, title: "Old name" }));

    const renamed = renameAgentSessionTitle(memoryScope, "New name");
    expect(renamed?.memoryScope).toBe(memoryScope);
    expect(renamed?.title).toBe("New name");
    expect(getAgentSessionByMemoryScope(memoryScope)?.title).toBe("New name");

    unregisterAgentSession(memoryScope);
  });

  it("applies a generated title only over placeholder names", () => {
    const placeholderScope = "conv:auto-title";
    registerAgentSession(session({ memoryScope: placeholderScope, title: "Chat · researcher" }));
    expect(applyGeneratedConversationTitle(placeholderScope, "CRISPR delivery")?.title).toBe(
      "CRISPR delivery",
    );

    const customScope = "conv:keep-custom";
    registerAgentSession(session({ memoryScope: customScope, title: "My notes" }));
    expect(applyGeneratedConversationTitle(customScope, "Should not win")?.title).toBe("My notes");

    unregisterAgentSession(placeholderScope);
    unregisterAgentSession(customScope);
  });

  it("hides a deleted session and does not re-register that scope", () => {
    const memoryScope = "conv:delete-keep-hidden";
    registerAgentSession(session({ memoryScope, title: "Gone" }));

    expect(unregisterAgentSession(memoryScope)?.memoryScope).toBe(memoryScope);
    expect(getAgentSessionByMemoryScope(memoryScope)).toBeUndefined();

    registerAgentSession(session({ memoryScope, title: "Should stay gone" }));
    expect(getAgentSessionByMemoryScope(memoryScope)).toBeUndefined();
  });
});

describe("registerAgentSessionFromEvent listed agents", () => {
  const listedAgentIds = new Set(["researcher"]);

  it("skips conversations for agents omitted from the project registry", () => {
    const memoryScope = "conv:hidden-namer";
    registerAgentSessionFromEvent(
      {
        type: "agent_started",
        agentCallId: "call-hidden",
        agentId: "conversation-title-namer",
        memoryScope,
        seq: 1,
        at: "2026-01-01T00:00:00.000Z",
        eventSchemaVersion: 1,
      },
      { listedAgentIds },
    );
    expect(getAgentSessionByMemoryScope(memoryScope)).toBeUndefined();
  });

  it("registers conversations for agents listed in the project registry", () => {
    const memoryScope = "conv:listed-researcher";
    registerAgentSessionFromEvent(
      {
        type: "agent_started",
        agentCallId: "call-listed",
        agentId: "researcher",
        memoryScope,
        seq: 1,
        at: "2026-01-01T00:00:00.000Z",
        eventSchemaVersion: 1,
      },
      { listedAgentIds },
    );
    expect(getAgentSessionByMemoryScope(memoryScope)?.agentId).toBe("researcher");
    unregisterAgentSession(memoryScope);
  });

  it("keeps the first agent as session owner when another agent shares the memoryScope", () => {
    const memoryScope = "conv:shared-scope";
    registerAgentSessionFromEvent(
      {
        type: "agent_started",
        agentCallId: "call-drafter",
        agentId: "drafter",
        memoryScope,
        workflowRunId: "run-1",
        seq: 1,
        at: "2026-01-01T00:00:00.000Z",
        eventSchemaVersion: 1,
      },
      { listedAgentIds: new Set(["drafter", "reviser"]) },
    );
    registerAgentSessionFromEvent(
      {
        type: "agent_started",
        agentCallId: "call-reviser",
        agentId: "reviser",
        memoryScope,
        workflowRunId: "run-1",
        seq: 2,
        at: "2026-01-01T00:00:01.000Z",
        eventSchemaVersion: 1,
      },
      { listedAgentIds: new Set(["drafter", "reviser"]) },
    );
    const session = getAgentSessionByMemoryScope(memoryScope);
    expect(session?.agentId).toBe("drafter");
    expect(session?.agentCallId).toBe("call-reviser");
    unregisterAgentSession(memoryScope);
  });
});

describe("conversation turn active", () => {
  it("tracks an in-process tool loop independently of the session record", () => {
    const memoryScope = "conv:turn-active";
    expect(isConversationTurnActive(memoryScope)).toBe(false);
    setConversationTurnActive(memoryScope, true);
    expect(isConversationTurnActive(memoryScope)).toBe(true);
    setConversationTurnActive(memoryScope, false);
    expect(isConversationTurnActive(memoryScope)).toBe(false);
  });

  it("clears the flag when the session is unregistered", () => {
    const memoryScope = "conv:turn-active-delete";
    registerAgentSession(session({ memoryScope }));
    setConversationTurnActive(memoryScope, true);
    unregisterAgentSession(memoryScope);
    expect(isConversationTurnActive(memoryScope)).toBe(false);
  });
});
