import { describe, expect, it } from "bun:test";

import { EVENT_SCHEMA_VERSION } from "../observability/events";
import { inMemoryWorkflowStore } from "../stores/in-memory-workflow-store";

describe("effect_intent / effect_settled events", () => {
  it("round-trips through WorkflowStore.listEvents", async () => {
    const store = inMemoryWorkflowStore();
    await store.recordEvent({
      type: "workflow_started",
      workflowRunId: "run-1",
      workflowId: "demo",
      input: {},
      runSeq: 1,
      at: "2026-01-01T00:00:00.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    await store.recordEvent({
      type: "effect_intent",
      workflowRunId: "run-1",
      intent: {
        id: "intent-1",
        kind: "step",
        reversibility: "compensable",
        workflowRunId: "run-1",
        stepId: "step-1",
        payload: { path: ["tick"], phase: "enter" },
      },
      runSeq: 2,
      at: "2026-01-01T00:00:01.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });
    await store.recordEvent({
      type: "effect_settled",
      workflowRunId: "run-1",
      intentId: "intent-1",
      decision: { action: "allow" },
      runSeq: 3,
      at: "2026-01-01T00:00:02.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });

    const events = await store.listEvents({ workflowRunId: "run-1" });
    expect(events.map((event) => event.type)).toEqual([
      "workflow_started",
      "effect_intent",
      "effect_settled",
    ]);
    const intent = events[1];
    expect(intent?.type).toBe("effect_intent");
    if (intent?.type === "effect_intent") {
      expect(intent.intent.id).toBe("intent-1");
      expect(intent.intent.stepId).toBe("step-1");
    }
    const settled = events[2];
    expect(settled?.type).toBe("effect_settled");
    if (settled?.type === "effect_settled") {
      expect(settled.decision).toEqual({ action: "allow" });
    }
  });
});
