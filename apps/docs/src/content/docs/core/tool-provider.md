---
title: Tool providers
description: ToolProvider, createToolProvider, combineToolProviders, and per-call toolProviderContext.
---

`AgentDefinition.tools` and `agent.run({ tools })` accept either a plain AI SDK `ToolSet` or a **`ToolProvider`**: an object that builds the tool set from call context. Use a provider when configuration depends on the call — which sandbox root to use, which API key, which dataset — rather than staying fixed for the life of the agent.

Resolved once per `agent.run` / `agent.stream`, then merged into `streamText`'s `tools`. This is not AI SDK `prepareStep` / `activeTools`, which only select among tools already registered for that call.

Sandboxed file/bash/`fetchUrl` factories that implement this interface live in the optional [`@agent-dev-lab/tools`](/guides/tools/) package. The provider contract itself is in `@agent-dev-lab/core`.

## ToolProvider

```ts
interface ToolProvider<Tools extends ToolSet = ToolSet, ToolProviderContext = unknown> {
  getTools(ctx: ExtendedToolProviderContext<ToolProviderContext>): Tools | Promise<Tools>;
  contextSchema?: z.ZodType<unknown, ToolProviderContext>;
  listTools?(): ToolProviderToolSummary[];
}
```

`getTools` is the only method the runtime calls. It receives:

| Field                 | Source                                                  |
| --------------------- | ------------------------------------------------------- |
| `agentId`             | The agent being run                                     |
| `memoryScope`         | Conversation key for this episode                       |
| `workflow?`           | `{ workflowRunId, stepId }` when inside a workflow      |
| `toolProviderContext` | The raw value from `agent.run({ toolProviderContext })` |

The framework never parses or validates `toolProviderContext`. If you want Zod defaults, call `.parse()` yourself at the start of `getTools`.

`contextSchema` and `listTools` are introspection-only (inspection UI / settings). The runtime never reads them. Skip `listTools` when the tool names themselves depend on a real context — the inspector treats a missing `listTools` as "cannot list" rather than calling `getTools` with a fabricated context.

A provider can be a class (constructor state, other interfaces) or a function wrapped with `createToolProvider`.

## createToolProvider

```ts
import { createToolProvider } from "@agent-dev-lab/core";
import { z } from "zod";

const sandboxSchema = z.object({ root: z.string().default(".") });

const tools = createToolProvider<z.input<typeof sandboxSchema>>({
  contextSchema: sandboxSchema,
  getTools: (ctx) => {
    const { root } = sandboxSchema.parse(ctx.toolProviderContext);
    return {
      // build tools for `root`
    };
  },
  listTools: () => [{ name: "bash", description: "Run a sandboxed command" }],
});

const agent = adl.createAgent({
  id: "coder",
  tools,
});

await agent.run({
  user: "List files",
  toolProviderContext: { root: "/tmp/work" },
}).result;
```

Pass `ToolProviderContext` as the type parameter; `Tools` is inferred from `getTools`. Narrowing the type is a trust boundary, not a runtime check — a caller can still pass a differently shaped value.

## Resolution order

Each turn merges three sources, later winning on the same tool name:

1. `createAdlRuntime({ tools })` — runtime defaults
2. `adl.createAgent({ tools })` — definition
3. `agent.run({ tools })` — per-call override

Each source may be a `ToolSet` or a `ToolProvider`. Providers are resolved in parallel against the same `ExtendedToolProviderContext`.

## combineToolProviders

Merges named sources into one provider. **Context is namespaced** by source name so two providers cannot collide on a field. Tool names stay flat — a later source wins on the same tool name.

```ts
import { combineToolProviders, createToolProvider } from "@agent-dev-lab/core";

const tools = combineToolProviders({
  sandbox: createToolProvider<{ root: string }>({
    getTools: (ctx) => ({
      /* bash jailed to ctx.toolProviderContext?.root */
    }),
  }),
  search: createToolProvider<{ apiKey: string }>({
    getTools: (ctx) => ({
      /* search using ctx.toolProviderContext?.apiKey */
    }),
  }),
});

await agent.run({
  user: "…",
  toolProviderContext: {
    sandbox: { root: "/tmp/work" },
    search: { apiKey: process.env.SEARCH_KEY },
  },
}).result;
```

A source that needs no context still needs a key; its `toolProviderContext` slot is unused.

`createWorkspaceToolProvider` from `@agent-dev-lab/tools` is **not** implemented with `combineToolProviders` — file tools and bash must share one `cwd`. It already includes `fetchUrl`; combine a workspace provider with another source when an agent needs something beyond that surface.

## Related

- [ToolProvider](/api/interfaces/toolprovider/), [createToolProvider](/api/functions/createtoolprovider/), [combineToolProviders](/api/functions/combinetoolproviders/)
- [Sandboxed tools](/guides/tools/) — `@agent-dev-lab/tools`
- [Agents](/core/agents/) — `adl.createAgent`, `stopWhen`, memory
