import { describe, expect, it } from "bun:test";
import {
  allowAllGate,
  composeEffectHandlers,
  EFFECT_GATE_UNDECIDED_REASON,
  type EffectDecision,
  type EffectHandler,
  type EffectIntent,
  type SuspendHandle,
} from "./index";

function sampleIntent(overrides?: Partial<EffectIntent>): EffectIntent {
  return {
    id: "eff_1",
    kind: "tool",
    reversibility: "irreversible",
    workflowRunId: "run_1",
    payload: { toolName: "bash", input: { command: "ls" } },
    ...overrides,
  };
}

function sampleSuspendHandle(): SuspendHandle {
  return {
    id: "sus_1",
    intentId: "eff_1",
    workflowRunId: "run_1",
    reason: "approval",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("composeEffectHandlers", () => {
  it("denies when the handler list is empty", async () => {
    const gate = composeEffectHandlers([]);
    await expect(gate.handle(sampleIntent())).resolves.toEqual({
      action: "deny",
      reason: EFFECT_GATE_UNDECIDED_REASON,
    });
  });

  it("denies when every handler defers", async () => {
    const defer: EffectHandler = {
      onIntent: async () => undefined,
    };
    const gate = composeEffectHandlers([defer, defer]);
    await expect(gate.handle(sampleIntent())).resolves.toEqual({
      action: "deny",
      reason: EFFECT_GATE_UNDECIDED_REASON,
    });
  });

  it("returns the first defined decision in order", async () => {
    const calls: string[] = [];
    const first: EffectHandler = {
      onIntent: async () => {
        calls.push("first");
        return undefined;
      },
    };
    const second: EffectHandler = {
      onIntent: async () => {
        calls.push("second");
        return { action: "allow" };
      },
    };
    const third: EffectHandler = {
      onIntent: async () => {
        calls.push("third");
        return { action: "deny", reason: "should not run" };
      },
    };
    const gate = composeEffectHandlers([first, second, third]);
    await expect(gate.handle(sampleIntent())).resolves.toEqual({ action: "allow" });
    expect(calls).toEqual(["first", "second"]);
  });

  it("passes through deny, rewrite, and suspend", async () => {
    const handle = sampleSuspendHandle();
    const cases: EffectDecision[] = [
      { action: "deny", reason: "blocked" },
      { action: "rewrite", payload: { toolName: "bash", input: { command: "echo ok" } } },
      { action: "suspend", handle },
    ];
    for (const decision of cases) {
      const gate = composeEffectHandlers([
        {
          onIntent: async () => decision,
        },
      ]);
      await expect(gate.handle(sampleIntent())).resolves.toEqual(decision);
    }
  });
});

describe("allowAllGate", () => {
  it("always allows", async () => {
    await expect(allowAllGate.handle(sampleIntent())).resolves.toEqual({
      action: "allow",
    });
  });
});
