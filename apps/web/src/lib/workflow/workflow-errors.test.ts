import { describe, expect, it } from "bun:test";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

import { adaptCoreEventsForWorkflowRun } from "../event-log/event-adapter";
import { formatSerializedError, formatSerializedErrorHeadline } from "../format-error";
import { buildRunViewState } from "../view-model/run-projection";
import type { RunEvent } from "../view-model/types";

const AT = "2026-01-01T00:00:00.000Z";

describe("formatSerializedError", () => {
  it("reads name, message, code, and extra fields", () => {
    const formatted = formatSerializedError({
      name: "APICallError",
      message: "Missing credentials",
      code: "unauthorized",
      statusCode: 401,
      stack: "Error: Missing credentials\n    at run",
    });
    expect(formatted.message).toBe("Missing credentials");
    expect(formatted.name).toBe("APICallError");
    expect(formatted.code).toBe("unauthorized");
    expect(formatted.extra).toEqual({ statusCode: 401 });
    expect(
      formatSerializedErrorHeadline({
        name: "APICallError",
        message: "Missing credentials",
        code: "unauthorized",
      }),
    ).toBe("APICallError unauthorized: Missing credentials");
  });
});

describe("adaptCoreEventsForWorkflowRun", () => {
  it("keeps workflow, step, and agent error payloads", () => {
    const error = { name: "Error", message: "boom", stack: "Error: boom" };
    const events: CoreRunEvent[] = [
      {
        type: "workflow_failed",
        workflowRunId: "run-1",
        runSeq: 1,
        at: AT,
        eventSchemaVersion: 1,
        error,
      },
      {
        type: "step_failed",
        workflowRunId: "run-1",
        runSeq: 2,
        at: AT,
        eventSchemaVersion: 1,
        stepId: "step-1",
        parentStepId: null,
        name: "research",
        path: ["research"],
        error,
      },
      {
        type: "agent_failed",
        workflowRunId: "run-1",
        stepId: "step-1",
        agentCallId: "ep-1",
        runSeq: 3,
        at: AT,
        eventSchemaVersion: 1,
        agentId: "researcher",
        error,
      },
    ];

    const adapted = adaptCoreEventsForWorkflowRun("run-1", events);
    expect(adapted).toEqual([
      { runSeq: 1, runId: "run-1", type: "run_failed", at: AT, error },
      { runSeq: 2, runId: "run-1", type: "step_failed", at: AT, stepId: "step-1", error },
      {
        runSeq: 3,
        runId: "run-1",
        type: "agent_failed",
        at: AT,
        stepId: "step-1",
        episodeId: "ep-1",
        error,
      },
    ]);
  });

  it("maps message commits with episode id and transcript length", () => {
    const adapted = adaptCoreEventsForWorkflowRun("run-1", [
      {
        type: "agent_messages_committed",
        workflowRunId: "run-1",
        stepId: "step-1",
        agentCallId: "ep-1",
        runSeq: 1,
        at: AT,
        eventSchemaVersion: 1,
        memoryScope: "notes",
        count: 2,
        total: 5,
      },
    ]);
    expect(adapted).toEqual([
      {
        runSeq: 1,
        runId: "run-1",
        type: "messages_committed",
        at: AT,
        stepId: "step-1",
        memoryScope: "notes",
        episodeId: "ep-1",
        messageCount: 2,
        total: 5,
      },
    ]);
  });
});

describe("buildRunViewState", () => {
  it("marks failed steps and does not leave them running", () => {
    const error = { name: "Error", message: "API key missing" };
    const events: RunEvent[] = [
      {
        runSeq: 1,
        runId: "run-1",
        type: "run_started",
        at: AT,
        workflowId: "literature-review",
        input: { topic: "x" },
      },
      {
        runSeq: 2,
        runId: "run-1",
        type: "step_started",
        at: AT,
        stepId: "step-1",
        parentStepId: null,
        name: "research",
        path: ["research"],
      },
      {
        runSeq: 3,
        runId: "run-1",
        type: "agent_started",
        at: AT,
        stepId: "step-1",
        agentId: "researcher",
        memoryScope: "notes",
        episodeId: "ep-1",
      },
      {
        runSeq: 4,
        runId: "run-1",
        type: "agent_failed",
        at: AT,
        stepId: "step-1",
        episodeId: "ep-1",
        error,
      },
      {
        runSeq: 5,
        runId: "run-1",
        type: "step_failed",
        at: AT,
        stepId: "step-1",
        error,
      },
      {
        runSeq: 6,
        runId: "run-1",
        type: "run_failed",
        at: AT,
        error,
      },
    ];

    const view = buildRunViewState("run-1", events);
    expect(view.status).toBe("failed");
    expect(view.error).toEqual(error);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.status).toBe("failed");
    expect(view.steps[0]?.startedAt).toBe(AT);
    expect(view.steps[0]?.finishedAt).toBe(AT);
    expect(view.steps[0]?.error).toEqual(error);
    expect(view.steps[0]?.agentEpisodes[0]?.status).toBe("failed");
    expect(view.steps[0]?.agentEpisodes[0]?.startedAt).toBe(AT);
    expect(view.steps[0]?.agentEpisodes[0]?.finishedAt).toBe(AT);
    expect(view.steps[0]?.agentEpisodes[0]?.error).toEqual(error);
  });

  it("settles in-flight steps when the run fails without a step_failed event", () => {
    const events: RunEvent[] = [
      {
        runSeq: 1,
        runId: "run-1",
        type: "run_started",
        at: AT,
        workflowId: "demo",
        input: {},
      },
      {
        runSeq: 2,
        runId: "run-1",
        type: "step_started",
        at: AT,
        stepId: "step-1",
        parentStepId: null,
        name: "work",
        path: ["work"],
      },
      {
        runSeq: 3,
        runId: "run-1",
        type: "run_failed",
        at: AT,
        error: { message: "boom" },
      },
    ];

    const view = buildRunViewState("run-1", events);
    expect(view.steps[0]?.status).toBe("failed");
  });

  it("keeps a still-running sibling episode after the other agent finishes", () => {
    const events: RunEvent[] = [
      {
        runSeq: 1,
        runId: "run-1",
        type: "run_started",
        at: AT,
        workflowId: "literature-review",
        input: { topic: "x" },
      },
      {
        runSeq: 2,
        runId: "run-1",
        type: "step_started",
        at: AT,
        stepId: "step-1",
        parentStepId: null,
        name: "research",
        path: ["research"],
      },
      {
        runSeq: 3,
        runId: "run-1",
        type: "agent_started",
        at: AT,
        stepId: "step-1",
        agentId: "researcher",
        memoryScope: "notes",
        episodeId: "ep-researcher",
      },
      {
        runSeq: 4,
        runId: "run-1",
        type: "agent_started",
        at: AT,
        stepId: "step-1",
        agentId: "critic",
        memoryScope: "critique",
        episodeId: "ep-critic",
      },
      {
        runSeq: 5,
        runId: "run-1",
        type: "text_delta",
        at: AT,
        stepId: "step-1",
        episodeId: "ep-researcher",
        delta: "partial",
      },
      {
        runSeq: 6,
        runId: "run-1",
        type: "agent_finished",
        at: AT,
        stepId: "step-1",
        episodeId: "ep-critic",
        durationMs: 100,
      },
    ];

    const view = buildRunViewState("run-1", events);
    const episodes = view.steps[0]?.agentEpisodes ?? [];
    expect(episodes).toHaveLength(2);
    expect(episodes.find((e) => e.episodeId === "ep-critic")?.status).toBe("completed");
    expect(episodes.find((e) => e.episodeId === "ep-researcher")?.status).toBe("running");
    expect(episodes.find((e) => e.episodeId === "ep-researcher")?.streamingText).toBe("partial");
  });
});
