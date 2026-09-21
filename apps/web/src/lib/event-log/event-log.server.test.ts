import { describe, expect, it } from "bun:test";

import {
  EVENT_SCHEMA_VERSION,
  inMemoryEventLog,
  inMemoryWorkflowStore,
  type RunEvent,
} from "@agent-dev-lab/core";

import {
  getEventLog,
  hydrateEventLogFromWorkflowStore,
  tailLoggedEvents,
} from "./event-log.server";

const AT = "2026-01-01T00:00:00.000Z";

function started(seq: number, workflowRunId = "run-1"): RunEvent {
  return {
    type: "workflow_started",
    workflowRunId,
    workflowId: "demo",
    input: { n: seq },
    runSeq: seq,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

describe("getEventLog", () => {
  it("returns the same process singleton", () => {
    expect(getEventLog()).toBe(getEventLog());
  });
});

describe("tailLoggedEvents", () => {
  it("emits buffered events then waits for append", async () => {
    const log = inMemoryEventLog();
    log.onEvent(started(1));
    const seen: number[] = [];
    const abort = new AbortController();
    const done = tailLoggedEvents(
      log,
      0,
      (entry) => {
        seen.push(entry.logSeq);
        return true;
      },
      abort.signal,
    );

    await Promise.resolve();
    expect(seen).toEqual([1]);

    log.onEvent(started(2, "run-2"));
    await Promise.resolve();
    expect(seen).toEqual([1, 2]);

    abort.abort();
    await done;
  });

  it("stops when onEvent returns false", async () => {
    const log = inMemoryEventLog();
    log.onEvent(started(1));
    log.onEvent(started(2, "run-2"));
    const seen: number[] = [];
    await tailLoggedEvents(log, 0, (entry) => {
      seen.push(entry.logSeq);
      return false;
    });
    expect(seen).toEqual([1]);
  });

  it("returns when the signal is aborted while waiting", async () => {
    const log = inMemoryEventLog();
    const abort = new AbortController();
    const done = tailLoggedEvents(log, 0, () => true, abort.signal);
    abort.abort();
    await done;
  });
});

function agentStarted(agentCallId = "call-solo"): RunEvent {
  return {
    type: "agent_started",
    agentCallId,
    agentId: "writer",
    memoryScope: "notes",
    runSeq: 1,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

function agentFinished(agentCallId = "call-solo"): RunEvent {
  return {
    type: "agent_finished",
    agentCallId,
    agentId: "writer",
    runSeq: 2,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

describe("hydrateEventLogFromWorkflowStore", () => {
  it("replays persisted run events into an empty log", async () => {
    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    await store.recordEvent(started(1, "run-b"));
    const log = inMemoryEventLog();

    await hydrateEventLogFromWorkflowStore(store, log);

    expect(log.list().map((entry) => entry.event.workflowRunId)).toEqual(["run-a", "run-b"]);
  });

  it("replays standalone agent episodes that are not part of a workflow run", async () => {
    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    await store.recordEvent(agentStarted());
    await store.recordEvent(agentFinished());
    const log = inMemoryEventLog();

    await hydrateEventLogFromWorkflowStore(store, log);

    expect(log.list().map((entry) => entry.event.type)).toEqual([
      "workflow_started",
      "agent_started",
      "agent_finished",
    ]);
    expect(log.list().filter((entry) => entry.event.type === "agent_started")).toHaveLength(1);
  });

  it("merges standalone episodes into a non-process log on a later hydrate", async () => {
    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    const log = inMemoryEventLog();
    await hydrateEventLogFromWorkflowStore(store, log);
    expect(log.list().map((entry) => entry.event.type)).toEqual(["workflow_started"]);

    await store.recordEvent(agentStarted());
    await store.recordEvent(agentFinished());
    await hydrateEventLogFromWorkflowStore(store, log);

    expect(log.list().map((entry) => entry.event.type)).toEqual([
      "workflow_started",
      "agent_started",
      "agent_finished",
    ]);
  });

  it("does not re-scan the store for the process log after the first hydrate", async () => {
    const { resetAdlProjectProcessHost } = await import("@agent-dev-lab/core/project");
    await resetAdlProjectProcessHost();

    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    const processLog = getEventLog();
    await hydrateEventLogFromWorkflowStore(store, processLog);
    expect(processLog.list().map((e) => e.event.workflowRunId)).toEqual(["run-a"]);

    await store.recordEvent(started(1, "run-b"));
    await hydrateEventLogFromWorkflowStore(store, processLog);
    expect(processLog.list().map((e) => e.event.workflowRunId)).toEqual(["run-a"]);
  });

  it("shares one in-flight process hydrate across concurrent callers", async () => {
    const { resetAdlProjectProcessHost } = await import("@agent-dev-lab/core/project");
    await resetAdlProjectProcessHost();

    let listRunsCalls = 0;
    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    const originalListRuns = store.listRuns.bind(store);
    store.listRuns = async (opts) => {
      listRunsCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return originalListRuns(opts);
    };

    const processLog = getEventLog();
    await Promise.all([
      hydrateEventLogFromWorkflowStore(store, processLog),
      hydrateEventLogFromWorkflowStore(store, processLog),
      hydrateEventLogFromWorkflowStore(store, processLog),
    ]);

    expect(listRunsCalls).toBe(1);
    expect(processLog.list().map((e) => e.event.workflowRunId)).toEqual(["run-a"]);
  });

  it("retries process hydrate after a failed attempt", async () => {
    const { resetAdlProjectProcessHost } = await import("@agent-dev-lab/core/project");
    await resetAdlProjectProcessHost();

    let listRunsCalls = 0;
    const store = inMemoryWorkflowStore();
    await store.recordEvent(started(1, "run-a"));
    const originalListRuns = store.listRuns.bind(store);
    store.listRuns = async (opts) => {
      listRunsCalls += 1;
      if (listRunsCalls === 1) {
        throw new Error("store unavailable");
      }
      return originalListRuns(opts);
    };

    const processLog = getEventLog();
    await expect(hydrateEventLogFromWorkflowStore(store, processLog)).rejects.toThrow(
      /store unavailable/,
    );
    expect(processLog.list()).toEqual([]);

    await hydrateEventLogFromWorkflowStore(store, processLog);
    expect(listRunsCalls).toBe(2);
    expect(processLog.list().map((e) => e.event.workflowRunId)).toEqual(["run-a"]);
  });
});
