import { describe, expect, it } from "bun:test";

import { createAdlRuntime, inMemoryWorkflowStore } from "@agent-dev-lab/core";
import type { LoadedAdlProject } from "@agent-dev-lab/core/project";

import { getEventLog } from "./event-log.server";
import { attachInspectorObservers } from "./inspector-agent-observer.server";

function projectFor(
  runtime: ReturnType<typeof createAdlRuntime>,
  workflow: { id: string },
): LoadedAdlProject {
  return {
    listWorkflowIds: () => [workflow.id],
    getWorkflow: () => workflow,
    listAgentIds: () => [],
    getAgent: () => undefined,
    getAdl: () => runtime,
  } as unknown as LoadedAdlProject;
}

describe("attachInspectorObservers", () => {
  it("puts the event log on the runtime observer lists", () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = runtime.createWorkflow({
      id: "attach-test",
      run: async () => ({ ok: true }),
    });
    attachInspectorObservers(runtime, projectFor(runtime, workflow));

    expect(runtime.services.observers.workflows).toContain(getEventLog());
    expect(runtime.services.observers.agents).toContain(getEventLog());
  });

  it("is idempotent on the same services object", () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = runtime.createWorkflow({
      id: "attach-once",
      run: async () => ({ ok: true }),
    });
    const project = projectFor(runtime, workflow);
    attachInspectorObservers(runtime, project);
    attachInspectorObservers(runtime, project);

    expect(
      runtime.services.observers.workflows.filter((observer) => observer === getEventLog()),
    ).toHaveLength(1);
  });

  it("also attaches to a workflow bound with its own observer arrays", () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = runtime.createWorkflow(
      { id: "copied-observers", run: async () => ({ ok: true }) },
      { observers: { workflows: [] } },
    );
    const workflowServices = (workflow as { services: (typeof runtime)["services"] }).services;
    expect(workflowServices.observers.workflows).not.toBe(runtime.services.observers.workflows);

    attachInspectorObservers(runtime, projectFor(runtime, workflow));

    expect(workflowServices.observers.workflows).toContain(getEventLog());
    expect(runtime.services.observers.workflows).toContain(getEventLog());
  });

  it("re-attaches after a new runtime generation (jiti reload)", async () => {
    const store = inMemoryWorkflowStore();
    const previous = createAdlRuntime({ stores: { workflow: store } });
    const previousWorkflow = previous.createWorkflow({
      id: "reload-me",
      run: async () => ({ ok: true }),
    });
    attachInspectorObservers(previous, projectFor(previous, previousWorkflow));

    const next = createAdlRuntime({ stores: { workflow: store } });
    const nextWorkflow = next.createWorkflow({
      id: "reload-me",
      run: async () => ({ ok: true }),
    });
    expect(next.services.observers.workflows).not.toContain(getEventLog());

    attachInspectorObservers(next, projectFor(next, nextWorkflow));
    expect(next.services.observers.workflows).toContain(getEventLog());

    getEventLog().clear();
    await nextWorkflow.run({}).result;
    expect(
      getEventLog()
        .list()
        .map((entry) => entry.event.type),
    ).toEqual(["workflow_started", "workflow_finished"]);
  });
});
