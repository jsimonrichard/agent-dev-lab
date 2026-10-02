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

import { createMcpToolProvider } from "./provider.ts";

const FIXTURE_SERVER = fileURLToPath(new URL("./fixtures/echo-server.mjs", import.meta.url));

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(): ExtendedToolProviderContext<undefined> {
  return {
    agentId: "test-agent",
    agentCallId: "call-1",
    memoryScope: "test-scope",
  };
}

function stdioTransport(): Experimental_StdioMCPTransport {
  return new Experimental_StdioMCPTransport({
    command: process.execPath,
    args: [FIXTURE_SERVER],
  });
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
      const payload = intent.payload as { toolName: string; input: unknown };
      return {
        action: "rewrite",
        payload: { toolName: payload.toolName, input },
      };
    },
  };
}

describe("createMcpToolProvider", () => {
  it("throws when transport is missing", () => {
    expect(() =>
      createMcpToolProvider({
        // @ts-expect-error — intentional missing transport
        transport: undefined,
        effectGate: allowAllGate,
      }),
    ).toThrow(AdlError);
    try {
      createMcpToolProvider({
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
});
