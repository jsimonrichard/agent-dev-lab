/**
 * Contract tests for MessageStore / WorkflowStore implementations
 * living under memory/ and observability/ (this folder holds only the shared suite).
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import { createAdlRuntime } from "../runtime/create";
import { inMemoryMessageStore } from "../memory/in-memory";
import { sqliteMessageStore } from "../memory/sqlite";
import { inMemoryWorkflowStore } from "../observability/in-memory-workflow-store";
import { sqliteWorkflowStore } from "../observability/sqlite-workflow-store";
import type { MessageStore } from "../memory/types";
import type { WorkflowStore } from "../observability/workflow-store";
import { EVENT_SCHEMA_VERSION } from "../observability/events";

async function uniqueDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "adl-store-"));
  return path.join(dir, "test.sqlite");
}

function messageStoreContract(name: string, createStore: () => Promise<MessageStore>) {
  describe(`MessageStore (${name})`, () => {
    it("identifies its backend kind", async () => {
      const store = await createStore();
      expect(store.kind).toBe(name);
    });

    it("saves, loads, and lists scopes", async () => {
      const store = await createStore();
      expect(await store.load("s1")).toEqual([]);
      await store.save("s1", [{ role: "user", content: "hello" }]);
      await store.save("s2", [{ role: "assistant", content: "hi" }]);
      expect(await store.load("s1")).toEqual([{ role: "user", content: "hello" }]);
      expect(await store.listScopes()).toEqual(expect.arrayContaining(["s1", "s2"]));
      await store.delete("s1");
      expect(await store.load("s1")).toEqual([]);
      expect(await store.listScopes()).toEqual(["s2"]);
    });
  });
}

function workflowStoreContract(name: string, createStore: () => Promise<WorkflowStore>) {
  describe(`WorkflowStore (${name})`, () => {
    it("records runs, step cache, events, and agent episodes", async () => {
      const store = await createStore();
      const runtime = createAdlRuntime({ stores: { workflow: store } });
      const workflow = runtime.createWorkflow({
        id: "contract-counter",
        run: async (_input, ctx) => {
          const value = await ctx.step("add", async () => 2);
          return { value };
        },
      });

      const handle = workflow.run({});
      const output = await handle.result;
      expect(output).toEqual({ value: 2 });

      const runs = await store.listRuns({ workflowId: "contract-counter" });
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("ok");

      const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
      expect(events.every((event) => event.eventSchemaVersion === EVENT_SCHEMA_VERSION)).toBe(true);
      expect(events.some((event) => event.type === "workflow_started")).toBe(true);
      expect(events.some((event) => event.type === "step_finished")).toBe(true);

      const cached = await store.getStepOutput(handle.workflowRunId, {
        parentStepId: null,
        name: "add",
      });
      expect(cached).toBe(2);
    });

    it("renames a run without changing its id and can delete it", async () => {
      const store = await createStore();
      const runtime = createAdlRuntime({ stores: { workflow: store } });
      const workflow = runtime.createWorkflow({
        id: "contract-rename",
        run: async () => ({ ok: true }),
      });
      const handle = workflow.run({});
      await handle.result;

      await store.setRunTitle(handle.workflowRunId, "My run");
      const named = await store.getRun(handle.workflowRunId);
      expect(named?.workflowRunId).toBe(handle.workflowRunId);
      expect(named?.title).toBe("My run");

      await store.deleteRun(handle.workflowRunId);
      expect(await store.getRun(handle.workflowRunId)).toBeNull();
      expect(await store.listEvents({ workflowRunId: handle.workflowRunId })).toEqual([]);
    });

    it("keeps a title set before the run row exists", async () => {
      const store = await createStore();
      const runtime = createAdlRuntime({ stores: { workflow: store } });
      const workflow = runtime.createWorkflow({
        id: "contract-early-title",
        run: async () => ({ ok: true }),
      });

      await store.setRunTitle("early-title-run", "Named up front");
      const handle = workflow.run({}, { workflowRunId: "early-title-run" });
      await handle.result;

      const named = await store.getRun("early-title-run");
      expect(named?.workflowId).toBe("contract-early-title");
      expect(named?.title).toBe("Named up front");
    });
  });
}

messageStoreContract("in-memory", async () => inMemoryMessageStore());
workflowStoreContract("in-memory", async () => inMemoryWorkflowStore());

messageStoreContract("sqlite", async () => sqliteMessageStore({ path: await uniqueDbPath() }));
workflowStoreContract("sqlite", async () => sqliteWorkflowStore({ path: await uniqueDbPath() }));

describe("sqlite stores share a file", () => {
  it("lists agent episodes after restart", async () => {
    const dbPath = await uniqueDbPath();
    const first = sqliteWorkflowStore({ path: dbPath });
    await first.recordEvent({
      type: "agent_started",
      agentCallId: "call-1",
      agentId: "researcher",
      memoryScope: "conv:1",
      seq: 1,
      at: "2026-01-01T00:00:00.000Z",
      eventSchemaVersion: EVENT_SCHEMA_VERSION,
    });

    const reopened = sqliteWorkflowStore({ path: dbPath });
    const episodes = await reopened.listAgentEpisodes();
    expect(episodes).toEqual([
      {
        agentCallId: "call-1",
        agentId: "researcher",
        memoryScope: "conv:1",
        startedAt: "2026-01-01T00:00:00.000Z",
        workflowRunId: undefined,
        stepId: undefined,
      },
    ]);
  });
});
