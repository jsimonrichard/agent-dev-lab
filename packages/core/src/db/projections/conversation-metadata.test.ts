import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { describe, expect, it } from "bun:test";

import { sqliteWorkflowStore } from "../../observability/sqlite-workflow-store";
import { createTestRuntime } from "../../runtime/create-test";
import { sqliteConversationMetadataStore } from "../../stores/conversation-metadata";

import type { ConversationTitleInput, ConversationTitleOutput } from "../../agent/types";

function mockTextModel(text = "briefing") {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: text },
        { type: "text-end", id: "text-1" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      ]),
    }),
  });
}

async function uniqueDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "adl-conv-meta-"));
  return path.join(dir, "test.sqlite");
}

describe("adl_conversation_metadata projection", () => {
  it("persists a title from a headless agent.run(), with no UI writer involved", async () => {
    const dbPath = await uniqueDbPath();
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("briefing") },
      stores: { workflow: sqliteWorkflowStore({ path: dbPath }) },
    });
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async () => ({ title: "CRISPR delivery" }),
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });

    const handle = agent.run({
      memoryScope: "notes",
      user: "Summarize CRISPR delivery papers",
    });
    await handle.result;

    // Nothing in apps/web ran here — before this projection existed, core
    // emitted agent_title_set and the generated title was dropped.
    const store = sqliteConversationMetadataStore({ path: dbPath });
    const record = store.get("notes");
    expect(record).toBeDefined();
    expect(record?.title).toBe("CRISPR delivery");
    expect(record?.agentId).toBe("researcher");
    expect(record?.agentCallId).toBe(handle.agentCallId);
    expect(record?.createdAt).toBeTruthy();
    expect(record?.updatedAt).toBe(record?.createdAt);

    // And it shows up in the listing apps/web hydrates from.
    expect(store.list().map((row) => row.memoryScope)).toEqual(["notes"]);
  });

  it("leaves fork_json and deleted_at alone when a later title arrives", async () => {
    const dbPath = await uniqueDbPath();
    const store = sqliteConversationMetadataStore({ path: dbPath });
    const workflowStore = sqliteWorkflowStore({ path: dbPath });

    // A UI-created conversation: fork lineage and a soft delete are columns
    // core's projection does not own.
    store.upsert({
      memoryScope: "fork:abc",
      agentId: "researcher",
      agentCallId: "pending:fork:abc",
      title: "Fork · notes",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      fork: {
        sourceWorkflowId: "demo",
        sourceWorkflowRunId: "run-1",
        sourceStepId: "step-1",
        sourceAgentCallId: "call-1",
        sourceMemoryScope: "conv:1",
      },
      deletedAt: "2026-01-02T00:00:00.000Z",
    });

    await workflowStore.recordEvent({
      type: "agent_title_set",
      agentCallId: "call-9",
      agentId: "researcher",
      memoryScope: "fork:abc",
      title: "Retitled by core",
      runSeq: 1,
      at: "2026-01-03T00:00:00.000Z",
      eventSchemaVersion: 1,
    });

    const record = store.get("fork:abc");
    expect(record?.title).toBe("Retitled by core");
    expect(record?.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    // Not clobbered, and createdAt did not move.
    expect(record?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record?.fork?.sourceMemoryScope).toBe("conv:1");
    expect(record?.deletedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
