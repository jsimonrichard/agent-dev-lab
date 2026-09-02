import { describe, expect, it } from "bun:test";
import { tool } from "ai";
import { z } from "zod";

import { combineToolProviders, createToolProvider, resolveToolSource } from "./provider";
import type { ExtendedToolProviderContext } from "./provider";

const ctx: ExtendedToolProviderContext = {
  agentId: "researcher",
  memoryScope: "notes",
};

const lookup = tool({
  description: "Look up a topic",
  inputSchema: z.object({ topic: z.string() }),
  execute: async ({ topic }) => topic,
});

describe("resolveToolSource", () => {
  it("returns an empty object when the source is undefined", async () => {
    expect(await resolveToolSource(undefined, ctx)).toEqual({});
  });

  it("returns a plain ToolSet unchanged", async () => {
    const tools = { lookup };
    expect(await resolveToolSource(tools, ctx)).toBe(tools);
  });

  it("calls a ToolProvider's getTools with the given context and awaits its result", async () => {
    let receivedCtx: ExtendedToolProviderContext | undefined;
    const provider = {
      async getTools(providerCtx: ExtendedToolProviderContext) {
        receivedCtx = providerCtx;
        return { lookup };
      },
    };

    const resolved = await resolveToolSource(provider, ctx);

    expect(resolved).toEqual({ lookup });
    expect(receivedCtx).toEqual(ctx);
  });

  it("supports a synchronous getTools", async () => {
    const provider = {
      getTools: (providerCtx: ExtendedToolProviderContext) => ({
        lookup,
        agentId: tool({
          description: "echo agentId",
          inputSchema: z.object({}),
          execute: async () => providerCtx.agentId,
        }),
      }),
    };

    const resolved = await resolveToolSource(provider, ctx);

    expect(Object.keys(resolved)).toEqual(["lookup", "agentId"]);
  });

  it("supports a class implementing ToolProvider", async () => {
    class EchoAgentIdProvider {
      getTools(providerCtx: ExtendedToolProviderContext) {
        return {
          agentId: tool({
            description: "echo agentId",
            inputSchema: z.object({}),
            execute: async () => providerCtx.agentId,
          }),
        };
      }
    }

    const resolved = await resolveToolSource(new EchoAgentIdProvider(), ctx);

    expect(Object.keys(resolved)).toEqual(["agentId"]);
  });
});

describe("combineToolProviders", () => {
  it("merges a plain ToolSet and a ToolProvider, later sources winning on name conflicts", async () => {
    const overridden = tool({
      description: "overridden",
      inputSchema: z.object({}),
      execute: async () => "first",
    });
    const winner = tool({
      description: "winner",
      inputSchema: z.object({}),
      execute: async () => "second",
    });

    const combined = combineToolProviders({
      a: { lookup, shared: overridden },
      b: createToolProvider({ getTools: () => ({ shared: winner }) }),
    });

    // A fresh literal (not the module-level `ctx`, which is fixed to `unknown`) so TS can
    // check it contextually against the combined provider's namespaced context type.
    const resolved = await resolveToolSource(combined, {
      agentId: "researcher",
      memoryScope: "notes",
      toolProviderContext: {},
    });

    expect(Object.keys(resolved).sort()).toEqual(["lookup", "shared"]);
    expect(resolved.shared).toBe(winner);
  });

  it("tolerates undefined entries", async () => {
    const seen: unknown[] = [];
    const combined = combineToolProviders({
      a: undefined,
      b: createToolProvider({
        getTools: (providerCtx) => {
          seen.push(providerCtx.toolProviderContext);
          return { lookup };
        },
      }),
    });

    await resolveToolSource(combined, {
      agentId: "researcher",
      memoryScope: "notes",
      toolProviderContext: {},
    });

    expect(seen).toEqual([undefined]);
  });

  it("namespaces context by key — each source sees only its own slice", async () => {
    let seenSandbox: unknown;
    let seenSearch: unknown;
    const sandboxProvider = createToolProvider<{ root: string }>({
      getTools: (providerCtx) => {
        seenSandbox = providerCtx.toolProviderContext;
        return {
          bash: tool({
            description: "run a command",
            inputSchema: z.object({}),
            execute: async () => "ok",
          }),
        };
      },
    });
    const searchProvider = createToolProvider<{ apiKey: string }>({
      getTools: (providerCtx) => {
        seenSearch = providerCtx.toolProviderContext;
        return {
          webSearch: tool({
            description: "search the web",
            inputSchema: z.object({}),
            execute: async () => "ok",
          }),
        };
      },
    });

    const combined = combineToolProviders({ sandbox: sandboxProvider, search: searchProvider });

    const resolved = await resolveToolSource(combined, {
      ...ctx,
      toolProviderContext: { sandbox: { root: "/tmp" }, search: { apiKey: "secret" } },
    });

    expect(Object.keys(resolved).sort()).toEqual(["bash", "webSearch"]);
    expect(seenSandbox).toEqual({ root: "/tmp" });
    expect(seenSearch).toEqual({ apiKey: "secret" });
  });

  it("lets a source's key be omitted from toolProviderContext when it needs nothing", async () => {
    let sandboxCalls = 0;
    const sandboxProvider = createToolProvider<{ root: string } | undefined>({
      getTools: () => {
        sandboxCalls += 1;
        return {
          bash: tool({ description: "run", inputSchema: z.object({}), execute: async () => "ok" }),
        };
      },
    });

    const combined = combineToolProviders({ sandbox: sandboxProvider, extra: { lookup } });

    const resolved = await resolveToolSource(combined, {
      ...ctx,
      toolProviderContext: { extra: undefined },
    });

    expect(sandboxCalls).toBe(1);
    expect(Object.keys(resolved).sort()).toEqual(["bash", "lookup"]);
  });

  it("aggregates constituent contextSchemas into one namespaced z.object() for introspection", () => {
    const sandboxSchema = z.object({ root: z.string().default("/tmp") });
    const searchSchema = z.object({ apiKey: z.string() });
    const sandboxProvider = createToolProvider<z.input<typeof sandboxSchema>>({
      getTools: () => ({ bash: lookup }),
      contextSchema: sandboxSchema,
    });
    const searchProvider = createToolProvider<z.input<typeof searchSchema>>({
      getTools: () => ({ webSearch: lookup }),
      contextSchema: searchSchema,
    });

    const combined = combineToolProviders({
      sandbox: sandboxProvider,
      search: searchProvider,
      extra: { lookup }, // no contextSchema — should not appear in the aggregated schema
    });

    expect(combined.contextSchema).toBeInstanceOf(z.ZodObject);
    const parsed = combined.contextSchema?.parse({
      sandbox: {},
      search: { apiKey: "secret" },
    });
    expect(parsed).toEqual({
      sandbox: { root: "/tmp" },
      search: { apiKey: "secret" },
    });
  });

  it("has no contextSchema when no source declares one", () => {
    const combined = combineToolProviders({
      a: { lookup },
      b: createToolProvider({ getTools: () => ({ lookup }) }),
    });

    expect(combined.contextSchema).toBeUndefined();
  });
});

describe("createToolProvider", () => {
  type SandboxContext = { root: string };

  it("narrows ctx.toolProviderContext to the given type at the call site", async () => {
    let receivedRoot: string | undefined;
    const provider = createToolProvider<SandboxContext>({
      getTools: (providerCtx) => {
        receivedRoot = providerCtx.toolProviderContext?.root;
        return {
          echoRoot: tool({
            description: "echo the sandbox root",
            inputSchema: z.object({}),
            execute: async () => providerCtx.toolProviderContext?.root ?? "",
          }),
        };
      },
    });

    const resolved = await resolveToolSource(provider, {
      ...ctx,
      toolProviderContext: { root: "/tmp/sandbox" },
    });

    expect(receivedRoot).toBe("/tmp/sandbox");
    expect(Object.keys(resolved)).toEqual(["echoRoot"]);
  });

  it("still resolves cleanly when the Context type allows omitting toolProviderContext", async () => {
    const provider = createToolProvider<SandboxContext | undefined>({
      getTools: () => ({ lookup }),
    });

    // A fresh literal (not the module-level `ctx`, which is fixed to `unknown`) so
    // TS can check it contextually against `ExtendedToolProviderContext<SandboxContext | undefined>`.
    const resolved = await resolveToolSource(provider, {
      agentId: "researcher",
      memoryScope: "notes",
    });

    expect(resolved).toEqual({ lookup });
  });

  it("carries the optional contextSchema as pure metadata, never parsed by the framework", async () => {
    const sandboxSchema = z.object({ root: z.string().default("/tmp") });
    let receivedRaw: unknown;
    const provider = createToolProvider<z.input<typeof sandboxSchema>>({
      getTools: (providerCtx) => {
        receivedRaw = providerCtx.toolProviderContext;
        return { lookup };
      },
      contextSchema: sandboxSchema,
    });

    expect(provider.contextSchema).toBe(sandboxSchema);

    // The framework passes the raw value through untouched — defaults are NOT applied
    // unless the provider's own getTools calls .parse() itself.
    await resolveToolSource(provider, { ...ctx, toolProviderContext: {} });
    expect(receivedRaw).toEqual({});
  });

  it("rejects a contextSchema whose input shape doesn't match ToolProviderContext (compile-time only)", () => {
    const wrongSchema = z.object({ apiKey: z.string() });
    createToolProvider<SandboxContext>({
      getTools: () => ({ lookup }),
      // @ts-expect-error -- wrongSchema's input ({ apiKey }) doesn't match SandboxContext ({ root })
      contextSchema: wrongSchema,
    });
  });
});
