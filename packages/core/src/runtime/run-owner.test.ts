import { describe, expect, it } from "bun:test";

import { inMemoryWorkflowStore } from "../stores/in-memory-workflow-store";
import { createAdlRuntime } from "./create";
import { currentRunOwner, runOwnerLiveness } from "./run-owner";

describe("run owner", () => {
  it("stamps this process on workflow_started", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({ id: "owned", run: async () => ({ ok: true }) });
    const handle = workflow.run({});
    await handle.result;

    const started = await store.getLatestEvent(
      { workflowRunId: handle.workflowRunId },
      "workflow_started",
    );
    expect(started?.owner).toEqual(currentRunOwner());
    expect(runOwnerLiveness(started?.owner)).toBe("current");
  });

  it("treats a missing owner and a reused pid of this process as gone", () => {
    const self = currentRunOwner();
    expect(runOwnerLiveness(undefined)).toBe("gone");
    expect(runOwnerLiveness({ ...self, processId: "earlier-process" })).toBe("gone");
  });
});
