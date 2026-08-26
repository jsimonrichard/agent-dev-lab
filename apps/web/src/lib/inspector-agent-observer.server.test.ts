import { describe, expect, it } from "bun:test";

import { createAdlRuntime, inMemoryWorkflowStore } from "@agent-dev-lab/core";
import {
  clearInspectorAgentObserverAttached,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import { getEventLog } from "./event-log.server";
import {
  attachInspectorObservers,
  ensureInspectorAgentObserver,
} from "./inspector-agent-observer.server";

function projectFor(
  runtime: ReturnType<typeof createAdlRuntime>,
  workflow?: { id: string },
  agent?: { id: string },
): LoadedAdlProject {
  return {
    listWorkflowIds: () => (workflow ? [workflow.id] : []),
    getWorkflow: () => workflow,
    listAgentIds: () => (agent ? [agent.id] : []),
    getAgent: () => agent,
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

  it("attaches to an agent bound with its own observer arrays", () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const agent = runtime.createAgent(
      { id: "solo-agent", systemPrompt: "Be brief." },
      { observers: { agents: [] } },
    );
    const agentServices = (agent as { services: (typeof runtime)["services"] }).services;
    expect(agentServices.observers.agents).not.toBe(runtime.services.observers.agents);

    attachInspectorObservers(runtime, projectFor(runtime, undefined, agent));

    expect(agentServices.observers.agents).toContain(getEventLog());
    expect(runtime.services.observers.agents).toContain(getEventLog());
  });
});

describe("ensureInspectorAgentObserver", () => {
  it("re-attaches a new runtime after the one-shot flag is already set", async () => {
    clearInspectorAgentObserverAttached();
    const previous = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    await ensureInspectorAgentObserver(previous, projectFor(previous));

    const next = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    expect(next.services.observers.agents).not.toContain(getEventLog());

    await ensureInspectorAgentObserver(next, projectFor(next));
    expect(next.services.observers.agents).toContain(getEventLog());
    expect(next.services.observers.workflows).toContain(getEventLog());
  });
});
