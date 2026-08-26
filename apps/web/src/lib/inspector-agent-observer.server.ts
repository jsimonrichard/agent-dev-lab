import type {
  AdlRuntime,
  AgentObserver,
  InMemoryEventLog,
  RunEvent,
  RuntimeServices,
} from "@agent-dev-lab/core";
import {
  clearInspectorAgentObserverAttached,
  getInspectorListedAgentIds,
  markInspectorAgentObserverAttached,
  setInspectorListedAgentIds,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import { getAgentSessionByMemoryScope, registerAgentSessionFromEvent } from "#/lib/agent-sessions";
import { getEventLog, hydrateEventLogFromWorkflowStore } from "#/lib/event-log.server";
import { persistInspectorSession } from "#/lib/inspector-session-persist.server";

type ObserverHost = {
  __adlInspectorObserverState?: {
    eventLog: InMemoryEventLog;
    sessionObserver: AgentObserver;
  };
};

function observerState() {
  const host = globalThis as ObserverHost;
  if (!host.__adlInspectorObserverState) {
    host.__adlInspectorObserverState = {
      eventLog: getEventLog(),
      sessionObserver: {
        onEvent: (event) => {
          handleInspectorAgentEvent(event, getInspectorListedAgentIds());
        },
      },
    };
  }
  return host.__adlInspectorObserverState;
}

function handleInspectorAgentEvent(event: RunEvent, listedAgentIds: Set<string>): void {
  registerAgentSessionFromEvent(event, { listedAgentIds });
  if (event.type === "agent_title_set") {
    const session = getAgentSessionByMemoryScope(event.memoryScope);
    if (session) {
      void persistInspectorSession(session);
    }
  }
}

function servicesOf(item: unknown): RuntimeServices | undefined {
  if (!item || typeof item !== "object" || !("services" in item)) {
    return undefined;
  }
  return (item as { services?: RuntimeServices }).services;
}

function collectProjectServices(runtime: AdlRuntime, project: LoadedAdlProject): RuntimeServices[] {
  const collected: RuntimeServices[] = [runtime.services];
  for (const id of project.listWorkflowIds()) {
    const services = servicesOf(project.getWorkflow(id));
    if (services) {
      collected.push(services);
    }
  }
  for (const id of project.listAgentIds()) {
    const services = servicesOf(project.getAgent(id));
    if (services) {
      collected.push(services);
    }
  }
  return collected;
}

function pushUnique<T>(list: T[], item: T): void {
  if (!list.includes(item)) {
    list.push(item);
  }
}

/**
 * Put the inspection UI observers on every services object a run might notify.
 * Idempotent: safe after jiti reload, which builds a new runtime with empty arrays.
 */
export function attachInspectorObservers(runtime: AdlRuntime, project: LoadedAdlProject): void {
  setInspectorListedAgentIds(project.listAgentIds());
  const state = observerState();
  state.eventLog = getEventLog();
  const eventLog = state.eventLog;
  const sessionObserver = state.sessionObserver;

  for (const services of collectProjectServices(runtime, project)) {
    pushUnique(services.observers.workflows, eventLog);
    pushUnique(services.observers.agents, eventLog);
    pushUnique(services.observers.agents, sessionObserver);
  }
}

/** Drop the attach flag so the next {@link ensureInspectorAgentObserver} re-attaches. */
export function resetInspectorAgentObserver(): void {
  clearInspectorAgentObserverAttached();
}

/**
 * Attach inspection UI observers to the current project generation and hydrate
 * the in-memory event log from the workflow store after a process restart.
 */
export async function ensureInspectorAgentObserver(
  runtime: AdlRuntime,
  project: LoadedAdlProject,
): Promise<void> {
  // Always attach — `pushUnique` is cheap, and a prior one-shot mark would skip
  // new service copies (jiti reload, late-bound agent observer arrays).
  attachInspectorObservers(runtime, project);
  markInspectorAgentObserverAttached();
  const store = runtime.services.stores.workflow;
  if (store) {
    await hydrateEventLogFromWorkflowStore(store);
  }
}
