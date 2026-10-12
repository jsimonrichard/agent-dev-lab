import {
  AdlError,
  type EffectGate,
  type ExtendedToolProviderContext,
  type ToolProvider,
  type ToolProviderToolSummary,
  type ToolSet,
} from "@agent-dev-lab/core";
import {
  createMCPClient,
  type MCPClient,
  type MCPClientConfig,
  type MCPTransport,
} from "@ai-sdk/mcp";
import { decideToolCall } from "../approval/assert-tool-allowed.ts";
import { effectScopeFromToolProviderContext } from "../approval/scope.ts";
import type { ToolEffectScope } from "../approval/types.ts";

/** HTTP/SSE config or a custom/stdio {@link MCPTransport} — same union AI SDK accepts. */
export type McpTransport = MCPClientConfig["transport"];

/** Optional typed schemas forwarded to `client.tools({ schemas })`. */
export type McpToolSchemas = NonNullable<Parameters<MCPClient["tools"]>[0]>["schemas"];

/** Default bound on the `initialize` handshake. */
export const DEFAULT_MCP_INIT_TIMEOUT_MS = 30_000;
/** Default bound on one `tools/call`. */
export const DEFAULT_MCP_CALL_TIMEOUT_MS = 120_000;
/** Default cap on one tool result, measured as UTF-8 JSON. */
export const DEFAULT_MCP_MAX_OUTPUT_BYTES = 256 * 1024;

const SERVER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Options for {@link createMcpToolProvider}.
 *
 * **Trust boundary:** constructing this provider with a `transport` trusts that MCP server's
 * tools at the agent's privilege level. This package does not sandbox remote MCP side effects.
 * `effectGate` is the only pre-materialize policy hook (allow / deny / rewrite). Suspend is
 * fail-closed unless the host wraps with `parkingEffectGate`. Requires
 * {@link ExtendedToolProviderContext.recordEffect} so intents persist. Do not omit the gate;
 * tests and permissive hosts pass {@link import("@agent-dev-lab/core").allowAllGate} explicitly.
 */
export interface McpToolProviderOptions {
  /**
   * Required. Stable id for this server (`[A-Za-z0-9_-]+`, e.g. `"github"`). Every intent
   * carries `source: "mcp:<serverId>"`, so gates and remembered approvals can tell this
   * server's `search` from another server's `search`.
   */
  serverId: string;
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
  /** Bound on connecting and `initialize`. Defaults to {@link DEFAULT_MCP_INIT_TIMEOUT_MS}. */
  initTimeoutMs?: number;
  /** Bound on each tool call. Defaults to {@link DEFAULT_MCP_CALL_TIMEOUT_MS}. */
  callTimeoutMs?: number;
  /**
   * Larger results are replaced by an error result the model can see. Defaults to
   * {@link DEFAULT_MCP_MAX_OUTPUT_BYTES}.
   */
  maxOutputBytes?: number;
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

function deniedToolResult(reason: string) {
  return errorToolResult(`MCP tool call denied: ${reason}`);
}

function errorToolResult(text: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text }], isError: true };
}

type ToolExecuteOptions = { toolCallId?: string; abortSignal?: AbortSignal };

function isToolExecuteOptions(value: unknown): value is ToolExecuteOptions {
  return typeof value === "object" && value !== null;
}

type McpCallLimits = { callTimeoutMs: number; maxOutputBytes: number };

function wrapToolWithGate(
  toolName: string,
  tool: GatedTool,
  effectGate: EffectGate,
  effectScope: ToolEffectScope,
  source: string,
  limits: McpCallLimits,
): GatedTool {
  const originalExecute = tool.execute;
  if (typeof originalExecute !== "function") {
    return tool;
  }

  return {
    ...tool,
    async execute(input: unknown, options: unknown) {
      if (!isToolExecuteOptions(options)) {
        throw new AdlError(
          "INVALID_CONTEXT",
          `createMcpToolProvider: "${toolName}" was executed without AI SDK tool options.`,
        );
      }
      const decision = await decideToolCall({
        gate: effectGate,
        toolName,
        input,
        effectScope,
        reversibility: "irreversible",
        source,
        ...(options.toolCallId !== undefined ? { toolCallId: options.toolCallId } : {}),
      });
      if (decision.isErr) {
        return deniedToolResult(decision.error);
      }

      const timeout = AbortSignal.timeout(limits.callTimeoutMs);
      const abortSignal = options.abortSignal
        ? AbortSignal.any([options.abortSignal, timeout])
        : timeout;
      let result: unknown;
      try {
        result = await originalExecute(decision.value, { ...options, abortSignal });
      } catch (error) {
        if (timeout.aborted && !options.abortSignal?.aborted) {
          throw new AdlError(
            "INVALID_CONTEXT",
            `MCP tool "${toolName}" on ${source} did not finish within ${limits.callTimeoutMs} ms.`,
            { cause: error },
          );
        }
        throw error;
      }

      const bytes = Buffer.byteLength(JSON.stringify(result) ?? "", "utf8");
      if (bytes > limits.maxOutputBytes) {
        return errorToolResult(
          `MCP tool "${toolName}" on ${source} returned ${bytes} bytes, over the ` +
            `${limits.maxOutputBytes}-byte limit; the result was dropped.`,
        );
      }
      return result;
    },
  };
}

function wrapToolsWithGate(
  tools: ToolSet,
  effectGate: EffectGate,
  effectScope: ToolEffectScope,
  source: string,
  limits: McpCallLimits,
): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, entry] of Object.entries(tools)) {
    wrapped[name] = wrapToolWithGate(
      name,
      entry as GatedTool,
      effectGate,
      effectScope,
      source,
      limits,
    ) as ToolSet[string];
  }
  return wrapped;
}

function positiveLimit(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new AdlError(
      "INVALID_INPUT",
      `createMcpToolProvider: ${name} must be a positive, finite number (got ${value}).`,
    );
  }
  return value;
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

  if (typeof options.serverId !== "string" || !SERVER_ID_PATTERN.test(options.serverId)) {
    throw new AdlError(
      "INVALID_INPUT",
      "createMcpToolProvider: serverId is required and must match [A-Za-z0-9_-]+ " +
        `(got ${JSON.stringify(options.serverId)}).`,
    );
  }

  const { transport, effectGate, schemas, onUncaughtError, name, version } = options;
  const source = `mcp:${options.serverId}`;
  const initTimeoutMs = positiveLimit(
    "initTimeoutMs",
    options.initTimeoutMs,
    DEFAULT_MCP_INIT_TIMEOUT_MS,
  );
  const limits: McpCallLimits = {
    callTimeoutMs: positiveLimit(
      "callTimeoutMs",
      options.callTimeoutMs,
      DEFAULT_MCP_CALL_TIMEOUT_MS,
    ),
    maxOutputBytes: positiveLimit(
      "maxOutputBytes",
      options.maxOutputBytes,
      DEFAULT_MCP_MAX_OUTPUT_BYTES,
    ),
  };

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
        initializationOptions: { timeout: initTimeoutMs },
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

      return wrapToolsWithGate(
        tools as ToolSet,
        effectGate,
        effectScopeFromToolProviderContext(ctx),
        source,
        limits,
      );
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
