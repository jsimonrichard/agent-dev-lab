import {
  AdlError,
  type EffectDecision,
  type EffectGate,
  type ExtendedToolProviderContext,
  type ToolProvider,
  type ToolProviderToolSummary,
  type ToolSet,
} from "@agent-dev-lab/core";
import {
  experimental_createMCPClient as createMCPClient,
  type experimental_MCPClient as MCPClient,
  type experimental_MCPClientConfig as MCPClientConfig,
  type MCPTransport,
} from "@ai-sdk/mcp";
import { randomUUID } from "node:crypto";

/** HTTP/SSE config or a custom/stdio {@link MCPTransport} — same union AI SDK accepts. */
export type McpTransport = MCPClientConfig["transport"];

/** Optional typed schemas forwarded to `client.tools({ schemas })`. */
export type McpToolSchemas = NonNullable<Parameters<MCPClient["tools"]>[0]>["schemas"];

/**
 * Payload shape for `kind: "tool"` intents produced by this provider — and the expected
 * shape of an EffectGate `rewrite` decision's `payload`.
 */
export type McpToolEffectPayload = {
  toolName: string;
  input: unknown;
};

/**
 * Options for {@link createMcpToolProvider}.
 *
 * **Trust boundary:** constructing this provider with a `transport` trusts that MCP server's
 * tools at the agent's privilege level. This package does not sandbox remote MCP side effects.
 * `effectGate` is the only pre-materialize policy hook (allow / deny / rewrite). Suspend is
 * fail-closed until a SuspendStore exists (Lane E / later) — do not omit the gate; tests and
 * permissive hosts pass {@link import("@agent-dev-lab/core").allowAllGate} explicitly.
 */
export interface McpToolProviderOptions {
  /**
   * Required. Connection to the MCP server — HTTP/SSE config object or an `MCPTransport`
   * (e.g. `Experimental_StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio`). No ambient default.
   */
  transport: McpTransport;
  /**
   * Required. Pre-materialize gate for every MCP tool call. Pass `allowAllGate` explicitly
   * for tests/CI — never an ambient omit→allow default.
   */
  effectGate: EffectGate;
  /** When set, forwarded to `client.tools({ schemas })` (typed / filtered tool subset). */
  schemas?: McpToolSchemas;
  /** Forwarded to `createMCPClient`. */
  onUncaughtError?: MCPClientConfig["onUncaughtError"];
  /** Forwarded to `createMCPClient` (defaults apply in the AI SDK). */
  name?: MCPClientConfig["name"];
  /** Forwarded to `createMCPClient` (defaults apply in the AI SDK). */
  version?: MCPClientConfig["version"];
}

type GatedTool = {
  description?: string;
  execute?: (input: unknown, options: unknown) => PromiseLike<unknown> | unknown;
  [key: string]: unknown;
};

function isMcpToolEffectPayload(value: unknown): value is McpToolEffectPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "toolName" in value &&
    typeof (value as { toolName: unknown }).toolName === "string" &&
    "input" in value
  );
}

function resolveRewriteInput(
  decision: Extract<EffectDecision, { action: "rewrite" }>,
  toolName: string,
): unknown {
  if (!isMcpToolEffectPayload(decision.payload)) {
    throw new AdlError(
      "INVALID_INPUT",
      "createMcpToolProvider: EffectGate rewrite payload must be { toolName, input }.",
    );
  }
  if (decision.payload.toolName !== toolName) {
    throw new AdlError(
      "INVALID_INPUT",
      `createMcpToolProvider: EffectGate rewrite changed toolName from "${toolName}" to "${decision.payload.toolName}".`,
    );
  }
  return decision.payload.input;
}

function deniedToolResult(reason: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: `MCP tool call denied: ${reason}` }],
    isError: true,
  };
}

function wrapToolWithGate(
  toolName: string,
  tool: GatedTool,
  effectGate: EffectGate,
  runScope: {
    workflowRunId: string;
    agentCallId: string;
    stepId: string | null;
  },
): GatedTool {
  const originalExecute = tool.execute;
  if (typeof originalExecute !== "function") {
    return tool;
  }

  return {
    ...tool,
    async execute(input: unknown, options: unknown) {
      const intent = {
        id: randomUUID(),
        kind: "tool" as const,
        reversibility: "irreversible" as const,
        workflowRunId: runScope.workflowRunId,
        stepId: runScope.stepId,
        agentCallId: runScope.agentCallId,
        payload: { toolName, input } satisfies McpToolEffectPayload,
      };
      const decision = await effectGate.handle(intent);

      switch (decision.action) {
        case "allow":
          return await originalExecute(input, options);
        case "deny":
          return deniedToolResult(decision.reason);
        case "rewrite":
          return await originalExecute(resolveRewriteInput(decision, toolName), options);
        case "suspend":
          throw new AdlError(
            "INVALID_CONTEXT",
            "createMcpToolProvider: EffectGate suspend is not supported yet " +
              "(SuspendStore / resume lands with Lane E). Fail closed — call was not sent to the MCP server.",
          );
        default: {
          const _exhaustive: never = decision;
          throw new AdlError(
            "INVALID_INPUT",
            `createMcpToolProvider: unexpected EffectDecision ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
    },
  };
}

function wrapToolsWithGate(
  tools: ToolSet,
  effectGate: EffectGate,
  runScope: {
    workflowRunId: string;
    agentCallId: string;
    stepId: string | null;
  },
): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, entry] of Object.entries(tools)) {
    wrapped[name] = wrapToolWithGate(
      name,
      entry as GatedTool,
      effectGate,
      runScope,
    ) as ToolSet[string];
  }
  return wrapped;
}

/**
 * `ToolProvider` that connects to one MCP server via `@ai-sdk/mcp` and exposes its tools as an
 * AI SDK {@link ToolSet}. One provider = one client; use `combineToolProviders` for multiple
 * servers.
 *
 * Requires {@link McpToolProviderOptions.transport} and {@link McpToolProviderOptions.effectGate}
 * — no ambient connection or silent allow. The client is process-scoped: lazy-connect on first
 * `getTools`, close in `dispose` (not per `onRunEnd`).
 */
export function createMcpToolProvider(
  options: McpToolProviderOptions,
): ToolProvider<ToolSet, undefined> {
  if (options.transport === undefined || options.transport === null) {
    throw new AdlError(
      "INVALID_INPUT",
      "createMcpToolProvider: transport is required — pass an HTTP/SSE config or MCPTransport " +
        "(no ambient default server).",
    );
  }
  if (options.effectGate === undefined || options.effectGate === null) {
    throw new AdlError(
      "INVALID_INPUT",
      "createMcpToolProvider: effectGate is required — pass allowAllGate explicitly for " +
        "permissive tests/hosts (no omit→allow default).",
    );
  }

  const { transport, effectGate, schemas, onUncaughtError, name, version } = options;

  let clientPromise: Promise<MCPClient> | undefined;
  let client: MCPClient | undefined;
  let disposed = false;
  let toolSummaries: ToolProviderToolSummary[] | undefined;

  async function ensureClient(): Promise<MCPClient> {
    if (disposed) {
      throw new AdlError(
        "INVALID_CONTEXT",
        "createMcpToolProvider: provider was disposed — create a new provider to reconnect.",
      );
    }
    if (!clientPromise) {
      clientPromise = createMCPClient({
        transport,
        onUncaughtError,
        name,
        version,
      }).then((c) => {
        client = c;
        return c;
      });
    }
    try {
      return await clientPromise;
    } catch (error) {
      // Allow a later getTools to retry after a failed connect.
      clientPromise = undefined;
      client = undefined;
      throw error;
    }
  }

  return {
    listTools(): ToolProviderToolSummary[] {
      return toolSummaries ?? [];
    },
    async getTools(ctx: ExtendedToolProviderContext<undefined>): Promise<ToolSet> {
      const mcpClient = await ensureClient();
      const tools =
        schemas === undefined ? await mcpClient.tools() : await mcpClient.tools({ schemas });

      toolSummaries = Object.entries(tools).map(([toolName, entry]) => ({
        name: toolName,
        description:
          typeof (entry as { description?: unknown }).description === "string"
            ? (entry as { description: string }).description
            : undefined,
      }));

      const workflowRunId = ctx.workflow?.workflowRunId ?? ctx.agentCallId;
      const stepId = ctx.workflow?.stepId ?? null;

      return wrapToolsWithGate(tools as ToolSet, effectGate, {
        workflowRunId,
        agentCallId: ctx.agentCallId,
        stepId,
      });
    },
    async dispose(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      const toClose =
        client ?? (clientPromise ? await clientPromise.catch(() => undefined) : undefined);
      client = undefined;
      clientPromise = undefined;
      toolSummaries = undefined;
      await toClose?.close();
    },
  };
}

export type { MCPTransport };
