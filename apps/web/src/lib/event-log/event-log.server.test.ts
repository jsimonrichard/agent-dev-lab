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
    seq,
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
    seq: 1,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

function agentFinished(agentCallId = "call-solo"): RunEvent {
  return {
    type: "agent_finished",
    agentCallId,
    agentId: "writer",
    seq: 2,
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

  it("merges standalone episodes recorded after the first hydrate", async () => {
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
});
