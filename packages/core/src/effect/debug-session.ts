import { createId } from "../internal/ids";
import type { EffectHandler, EffectIntent, SuspendHandle } from "./types";

const BREAK_KINDS = new Set(["step", "tool", "model"]);

export type DebugSession = {
  readonly handler: EffectHandler;
  /** Pause on the next matching intent for this run, or any run when omitted. */
  pause(workflowRunId?: string): void;
  /** After continue, break again on the next matching intent for this run. */
  armStepOver(workflowRunId: string): void;
  /** Persist L1 breakpoints as step path filters (`name` / `name:key` segments). */
  setStepBreakpoints(paths: readonly string[][]): void;
};

function pathKey(path: readonly string[]): string {
  return path.join("\0");
}

function stepPathFromIntent(intent: EffectIntent): string[] | null {
  if (intent.kind !== "step") {
    return null;
  }
  if (
    typeof intent.payload !== "object" ||
    intent.payload === null ||
    !("path" in intent.payload) ||
    !Array.isArray((intent.payload as { path: unknown }).path)
  ) {
    return null;
  }
  return (intent.payload as { path: string[] }).path;
}

export function createDebugSession(): DebugSession {
  const pauseRuns = new Set<string>();
  let pauseAny = false;
  const stepOverRuns = new Set<string>();
  const breakpointKeys = new Set<string>();

  const shouldBreak = (intent: EffectIntent): boolean => {
    if (!BREAK_KINDS.has(intent.kind)) {
      return false;
    }
    if (pauseAny || pauseRuns.has(intent.workflowRunId) || stepOverRuns.has(intent.workflowRunId)) {
      return true;
    }
    if (breakpointKeys.size === 0) {
      return false;
    }
    const path = stepPathFromIntent(intent);
    return path !== null && breakpointKeys.has(pathKey(path));
  };

  const consumeOneShot = (workflowRunId: string): void => {
    pauseAny = false;
    pauseRuns.delete(workflowRunId);
    stepOverRuns.delete(workflowRunId);
  };

  const handler: EffectHandler = {
    async onIntent(intent: EffectIntent) {
      if (!shouldBreak(intent)) {
        return undefined;
      }
      consumeOneShot(intent.workflowRunId);
      const handle: SuspendHandle = {
        id: createId(),
        intentId: intent.id,
        workflowRunId: intent.workflowRunId,
        reason: "debugger",
        createdAt: new Date().toISOString(),
      };
      return { action: "suspend", handle };
    },
  };

  return {
    handler,
    pause(workflowRunId) {
      if (workflowRunId) {
        pauseRuns.add(workflowRunId);
        return;
      }
      pauseAny = true;
    },
    armStepOver(workflowRunId) {
      stepOverRuns.add(workflowRunId);
    },
    setStepBreakpoints(paths) {
      breakpointKeys.clear();
      for (const path of paths) {
        breakpointKeys.add(pathKey(path));
      }
    },
  };
}
