import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  allowAllGate,
  composeEffectHandlers,
  type EffectGate,
  type EffectIntent,
  type SuspendHandle,
} from "@agent-dev-lab/core";

import {
  approvalDispatcherAsHandler,
  assertToolAllowed,
  effectScopeFromToolProviderContext,
  testToolEffectScope,
  TOOL_SUSPEND_UNSUPPORTED_MESSAGE,
  type ApprovalDecision,
  type ApprovalDispatcher,
  type ApprovalRequest,
} from "./index.ts";
import { createFileTools } from "../file/tools.ts";
import { createBashTool } from "../bash/tools.ts";
import type { BashExecutor, BashExecutorResult, BashExecutorUpdate } from "../bash/executor.ts";

const toolCallOptions = { toolCallId: "gate-test-call", messages: [] as [], context: {} };
const effectScope = testToolEffectScope("test-run", { agentCallId: "agent-call-1" });

function denyGate(reason = "denied by test"): EffectGate {
  return {
    handle() {
      return Promise.resolve({ action: "deny", reason });
    },
  };
}

function rewriteGate(payload: unknown): EffectGate {
  return {
    handle() {
      return Promise.resolve({ action: "rewrite", payload });
    },
  };
}

function suspendGate(): EffectGate {
  const handle: SuspendHandle = {
    id: "suspend-1",
    intentId: "intent-1",
    workflowRunId: "test-run",
    reason: "approval",
    createdAt: new Date().toISOString(),
  };
  return {
    handle() {
      return Promise.resolve({ action: "suspend", handle });
    },
  };
}

function stubBashExecutor(): BashExecutor & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    describe() {
      return {
        backend: "native" as const,
        allowWrite: ["/workspace"],
        allowRead: ["/workspace"],
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false, allowedDomains: [], deniedDomains: [] },
      };
    },
    async *run(): AsyncGenerator<BashExecutorUpdate, void, undefined> {
      state.calls++;
      const result: BashExecutorResult = {
        done: true,
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        truncated: false,
      };
      yield result;
    },
  };
}

describe("assertToolAllowed", () => {
  it("returns input on allow", async () => {
    const input = { path: "a.txt" };
    await expect(
      assertToolAllowed({
        gate: allowAllGate,
        toolName: "readFile",
        input,
        effectScope,
      }),
    ).resolves.toEqual(input);
  });

  it("throws on deny", async () => {
    await expect(
      assertToolAllowed({
        gate: denyGate("nope"),
        toolName: "writeFile",
        input: { path: "a.txt", content: "x" },
        effectScope,
      }),
    ).rejects.toThrow(/Tool call denied: nope/);
  });

  it("applies rewrite payload input", async () => {
    const rewritten = await assertToolAllowed({
      gate: rewriteGate({ toolName: "writeFile", input: { path: "b.txt", content: "rewritten" } }),
      toolName: "writeFile",
      input: { path: "a.txt", content: "orig" },
      effectScope,
    });
    expect(rewritten).toEqual({ path: "b.txt", content: "rewritten" });
  });

  it("rejects suspend until SuspendStore exists", async () => {
    await expect(
      assertToolAllowed({
        gate: suspendGate(),
        toolName: "bash",
        input: { command: "echo hi" },
        effectScope,
      }),
    ).rejects.toThrow(TOOL_SUSPEND_UNSUPPORTED_MESSAGE);
  });

  it("emits effect_intent then effect_settled around the gate", async () => {
    const events: Array<{ type: string; intentId?: string }> = [];
    const scoped = testToolEffectScope("test-run", {
      agentCallId: "agent-call-1",
      recordEffect: async (event) => {
        if (event.type === "effect_intent") {
          events.push({ type: event.type, intentId: event.intent.id });
        } else if (event.type === "effect_settled") {
          events.push({ type: event.type, intentId: event.intentId });
        }
      },
    });
    await assertToolAllowed({
      gate: allowAllGate,
      toolName: "readFile",
      input: { path: "a.txt" },
      effectScope: scoped,
      toolCallId: "tool-call-1",
    });
    expect(events).toEqual([
      { type: "effect_intent", intentId: "tool-call-1" },
      { type: "effect_settled", intentId: "tool-call-1" },
    ]);
  });
});

describe("tool factories honor EffectGate before side effects", () => {
  it("denied writeFile does not create the file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-gate-write-"));
    try {
      const { writeFile: writeFileTool } = createFileTools({
        root,
        effectGate: denyGate(),
        effectScope,
      });
      await expect(
        writeFileTool.execute?.({ path: "secret.txt", content: "nope" }, toolCallOptions),
      ).rejects.toThrow(/Tool call denied/);
      await expect(readFile(path.join(root, "secret.txt"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("denied bash does not run the executor", async () => {
    const executor = stubBashExecutor();
    const { bash } = createBashTool({
      executor,
      cwd: "/workspace",
      effectGate: denyGate(),
      effectScope,
    });
    const result = bash.execute?.({ command: "echo hi" }, toolCallOptions);
    expect(result).toBeDefined();
    const iterator = (result as AsyncGenerator<unknown>).next();
    await expect(iterator).rejects.toThrow(/Tool call denied/);
    expect(executor.calls).toBe(0);
  });

  it("rewrite changes writeFile path before materialize", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-gate-rewrite-"));
    try {
      await mkdir(root, { recursive: true });
      const { writeFile: writeFileTool } = createFileTools({
        root,
        effectGate: rewriteGate({
          toolName: "writeFile",
          input: { path: "allowed.txt", content: "via-rewrite" },
        }),
        effectScope,
      });
      await writeFileTool.execute?.({ path: "blocked.txt", content: "orig" }, toolCallOptions);
      expect(await readFile(path.join(root, "allowed.txt"), "utf8")).toBe("via-rewrite");
      await expect(readFile(path.join(root, "blocked.txt"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("approvalDispatcherAsHandler", () => {
  it("invokes the dispatcher once per tool call", async () => {
    const requests: string[] = [];
    const dispatcher: ApprovalDispatcher = {
      async request(req) {
        requests.push(req.toolName);
        return { decision: "allow" };
      },
    };
    const gate = composeEffectHandlers([approvalDispatcherAsHandler(dispatcher)]);
    const root = await mkdtemp(path.join(tmpdir(), "adl-gate-dispatcher-"));
    try {
      await writeFile(path.join(root, "a.txt"), "hi", "utf8");
      const { readFile: readFileTool } = createFileTools({
        root,
        effectGate: gate,
        effectScope,
      });
      await readFileTool.execute?.({ path: "a.txt" }, toolCallOptions);
      await readFileTool.execute?.({ path: "a.txt" }, { ...toolCallOptions, toolCallId: "call-2" });
      expect(requests).toEqual(["readFile", "readFile"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("effectScopeFromToolProviderContext", () => {
  it("fails closed when recordEffect is missing", () => {
    expect(() =>
      effectScopeFromToolProviderContext({
        agentCallId: "call-1",
      }),
    ).toThrow(/missing recordEffect/);
  });
});

describe("approvalDispatcherAsHandler remember", () => {
  function toolIntent(
    id: string,
    toolName: string,
    extras: { agentCallId?: string; source?: string } = {},
  ): EffectIntent {
    return {
      id,
      kind: "tool",
      reversibility: "irreversible",
      workflowRunId: "run",
      ...(extras.agentCallId ? { agentCallId: extras.agentCallId } : {}),
      payload: {
        toolName,
        input: {},
        ...(extras.source ? { source: extras.source } : {}),
      },
    };
  }

  function countingDispatcher(decision: ApprovalDecision) {
    const requests: ApprovalRequest[] = [];
    const dispatcher: ApprovalDispatcher = {
      async request(req) {
        requests.push(req);
        return decision;
      },
    };
    return { dispatcher, requests };
  }

  it("asks every time for a plain allow", async () => {
    const { dispatcher, requests } = countingDispatcher({ decision: "allow" });
    const handler = approvalDispatcherAsHandler(dispatcher);
    await handler.onIntent(toolIntent("1", "bash", { agentCallId: "call-1" }));
    await handler.onIntent(toolIntent("2", "bash", { agentCallId: "call-1" }));
    expect(requests).toHaveLength(2);
  });

  it("remembers an allow only for the same agent call, source, and tool", async () => {
    const { dispatcher, requests } = countingDispatcher({
      decision: "allow",
      remember: "agentCall",
    });
    const handler = approvalDispatcherAsHandler(dispatcher);
    const github = { agentCallId: "call-1", source: "mcp:github" };
    await handler.onIntent(toolIntent("1", "search", github));
    await handler.onIntent(toolIntent("2", "search", github));
    await handler.onIntent(
      toolIntent("3", "search", { agentCallId: "call-1", source: "mcp:evil" }),
    );
    await handler.onIntent(
      toolIntent("4", "search", { agentCallId: "call-2", source: "mcp:github" }),
    );
    await handler.onIntent(toolIntent("5", "fetch", github));
    expect(requests.map((req) => req.intentId)).toEqual(["1", "3", "4", "5"]);
    expect(requests[0]?.source).toBe("mcp:github");
  });

  it("refuses to remember an allow outside an agent call", async () => {
    const { dispatcher } = countingDispatcher({ decision: "allow", remember: "agentCall" });
    const handler = approvalDispatcherAsHandler(dispatcher);
    await expect(handler.onIntent(toolIntent("1", "bash"))).rejects.toThrow(
      /outside an agent call/,
    );
  });
});
