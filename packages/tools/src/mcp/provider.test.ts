import { describe, expect, it } from "bun:test";
import {
  AdlError,
  allowAllGate,
  type EffectDecision,
  type EffectGate,
  type EffectIntent,
  type ExtendedToolProviderContext,
} from "@agent-dev-lab/core";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { fileURLToPath } from "node:url";

import { silentRecordEffect } from "../approval/types.ts";
import { createMcpToolProvider } from "./provider.ts";

const FIXTURE_SERVER = fileURLToPath(new URL("./fixtures/echo-server.mjs", import.meta.url));

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [], context: {} };

function ctx(): ExtendedToolProviderContext<undefined> {
  return {
    agentId: "test-agent",
    agentCallId: "call-1",
    memoryScope: "test-scope",
    recordEffect: silentRecordEffect,
  };
}

function stdioTransport(env: Record<string, string> = {}): Experimental_StdioMCPTransport {
  return new Experimental_StdioMCPTransport({
    command: process.execPath,
    args: [FIXTURE_SERVER],
    env: { ...(process.env as Record<string, string>), ...env },
  });
}

function recordingGate(intents: EffectIntent[]): EffectGate {
  return {
    async handle(intent: EffectIntent): Promise<EffectDecision> {
      intents.push(intent);
      return { action: "allow" };
    },
  };
}

function denyAllGate(reason = "blocked by test"): EffectGate {
  return {
    handle(): Promise<EffectDecision> {
      return Promise.resolve({ action: "deny", reason });
    },
  };
}

function rewriteGate(input: unknown): EffectGate {
  return {
    async handle(intent: EffectIntent): Promise<EffectDecision> {
      const payload = intent.payload as { toolName: string; input: unknown; source?: string };
      return {
        action: "rewrite",
        payload: { ...payload, input },
      };
    },
  };
}

describe("createMcpToolProvider", () => {
  it("throws when transport is missing", () => {
    expect(() =>
      createMcpToolProvider({
        serverId: "echo",
        // @ts-expect-error — intentional missing transport
        transport: undefined,
        effectGate: allowAllGate,
      }),
    ).toThrow(AdlError);
    try {
      createMcpToolProvider({
        serverId: "echo",
        // @ts-expect-error — intentional missing transport
        transport: undefined,
        effectGate: allowAllGate,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AdlError);
      expect((error as AdlError).code).toBe("INVALID_INPUT");
      expect((error as Error).message).toContain("transport is required");
    }
  });

  it("throws when effectGate is missing", () => {
    try {
      createMcpToolProvider({
        serverId: "echo",
        transport: stdioTransport(),
        // @ts-expect-error — intentional missing gate
        effectGate: undefined,
      });
      expect.unreachable("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AdlError);
      expect((error as AdlError).code).toBe("INVALID_INPUT");
      expect((error as Error).message).toContain("effectGate is required");
    }
  });

  it("connects to a stdio fixture and executes echo under allowAllGate", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: allowAllGate,
    });
    try {
      const tools = await provider.getTools(ctx());
      expect(Object.keys(tools)).toContain("echo");
      expect(provider.listTools?.().map((summary) => summary.name)).toEqual(["echo"]);

      const echo = tools.echo;
      expect(echo).toBeDefined();
      if (!echo?.execute) {
        throw new Error("echo tool missing execute");
      }
      const result = await echo.execute({ message: "hello-mcp" }, toolCallOptions);
      expect(result).toEqual({
        content: [{ type: "text", text: "hello-mcp" }],
        isError: false,
      });
    } finally {
      await provider.dispose?.();
    }
  });

  it("denies without calling the MCP server when the gate denies", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: denyAllGate("nope"),
    });
    try {
      const tools = await provider.getTools(ctx());
      const echo = tools.echo;
      if (!echo?.execute) {
        throw new Error("echo tool missing execute");
      }
      const result = await echo.execute({ message: "should-not-echo" }, toolCallOptions);
      expect(result).toEqual({
        content: [{ type: "text", text: "MCP tool call denied: nope" }],
        isError: true,
      });
    } finally {
      await provider.dispose?.();
    }
  });

  it("applies rewrite payloads before materializing the MCP call", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: rewriteGate({ message: "rewritten" }),
    });
    try {
      const tools = await provider.getTools(ctx());
      const echo = tools.echo;
      if (!echo?.execute) {
        throw new Error("echo tool missing execute");
      }
      const result = await echo.execute({ message: "original" }, toolCallOptions);
      expect(result).toEqual({
        content: [{ type: "text", text: "rewritten" }],
        isError: false,
      });
    } finally {
      await provider.dispose?.();
    }
  });

  it("dispose is idempotent and blocks further getTools", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: allowAllGate,
    });
    await provider.getTools(ctx());
    await provider.dispose?.();
    await provider.dispose?.();
    await expect(provider.getTools(ctx())).rejects.toMatchObject({
      code: "INVALID_CONTEXT",
    });
  });

  it("rejects a missing or malformed serverId", () => {
    for (const serverId of [undefined, "", "has space", "mcp:echo"]) {
      expect(() =>
        createMcpToolProvider({
          // @ts-expect-error — intentional bad serverId
          serverId,
          transport: stdioTransport(),
          effectGate: allowAllGate,
        }),
      ).toThrow(/serverId is required/);
    }
  });

  it("stamps the server as the intent source and uses the AI SDK toolCallId", async () => {
    const intents: EffectIntent[] = [];
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: recordingGate(intents),
    });
    try {
      const { echo } = await provider.getTools(ctx());
      await echo!.execute!({ message: "hi" }, toolCallOptions);
      expect(intents).toHaveLength(1);
      expect(intents[0]?.id).toBe(toolCallOptions.toolCallId);
      expect(intents[0]?.payload).toEqual({
        toolName: "echo",
        input: { message: "hi" },
        source: "mcp:echo",
      });
    } finally {
      await provider.dispose?.();
    }
  });

  it("refuses a rewrite that changes the tool's source", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: {
        async handle(): Promise<EffectDecision> {
          return {
            action: "rewrite",
            payload: { toolName: "echo", input: { message: "x" }, source: "mcp:other" },
          };
        },
      },
    });
    try {
      const { echo } = await provider.getTools(ctx());
      await expect(echo!.execute!({ message: "hi" }, toolCallOptions)).rejects.toThrow(
        /changed the source/,
      );
    } finally {
      await provider.dispose?.();
    }
  });

  it("replaces a result over maxOutputBytes with an error result", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport(),
      effectGate: allowAllGate,
      maxOutputBytes: 64,
    });
    try {
      const { echo } = await provider.getTools(ctx());
      const result = await echo!.execute!({ message: "x".repeat(200) }, toolCallOptions);
      expect(result).toMatchObject({ isError: true });
      expect(JSON.stringify(result)).toContain("over the 64-byte limit");
    } finally {
      await provider.dispose?.();
    }
  });

  it("fails a call that runs past callTimeoutMs", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport({ ADL_MCP_FIXTURE_CALL_DELAY_MS: "5000" }),
      effectGate: allowAllGate,
      callTimeoutMs: 100,
    });
    try {
      const { echo } = await provider.getTools(ctx());
      await expect(echo!.execute!({ message: "slow" }, toolCallOptions)).rejects.toThrow(
        /did not finish within 100 ms/,
      );
    } finally {
      await provider.dispose?.();
    }
  });

  it("fails getTools when initialize runs past initTimeoutMs", async () => {
    const provider = createMcpToolProvider({
      serverId: "echo",
      transport: stdioTransport({ ADL_MCP_FIXTURE_INIT_DELAY_MS: "5000" }),
      effectGate: allowAllGate,
      initTimeoutMs: 100,
    });
    try {
      const started = Date.now();
      await expect(provider.getTools(ctx())).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(4_000);
    } finally {
      await provider.dispose?.();
    }
  });
});
