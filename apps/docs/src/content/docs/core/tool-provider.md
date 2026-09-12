---
title: Tool Providers
description: ToolProvider, createToolProvider, combineToolProviders, and per-call toolProviderContext.
---

`AgentDefinition.tools` and `agent.run({ tools })` accept either a plain AI SDK `ToolSet` or a **`ToolProvider`**: an object that builds the tool set from call context. Use a provider when configuration depends on the call — which sandbox root to use, which API key, which dataset — rather than staying fixed for the life of the agent.

Resolved once per `agent.run` / `agent.stream`, then merged into `streamText`'s `tools`. This is not AI SDK `prepareStep` / `activeTools`, which only select among tools already registered for that call.

Sandboxed file/bash/`fetchUrl` factories that implement this interface live in the optional [`@agent-dev-lab/tools`](/guides/tools/) package. The provider contract itself is in `@agent-dev-lab/core`.

## ToolProvider

```ts
interface ToolProvider<Tools extends ToolSet = ToolSet, ToolProviderContext = unknown> {
  getTools(ctx: ExtendedToolProviderContext<ToolProviderContext>): MaybePromise<Tools>;
  contextSchema?: z.ZodType<unknown, ToolProviderContext>;
  listTools?(): ToolProviderToolSummary[];
  /** Per agent.run / agent.stream episode — success, failure, or abort. */
  onRunEnd?(ctx: ExtendedToolProviderContext<ToolProviderContext>): MaybePromise<void>;
  /** Provider instance going away (reload outgoing registry, or project unload). */
  dispose?(): MaybePromise<void>;
}
```

`getTools` is the only method required for a turn. Optional hooks:

| Hook       | When                                                                                         | Typical Use                                      |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `onRunEnd` | End of this `agent.run` / `agent.stream` (`agentCallId`), including failure and abort        | Run-scoped resources (e.g. a future kernel)      |
| `dispose`  | Outgoing providers after a successful project reload, or `LoadedAdlProject.dispose` / unload | Process/project-scoped resources (executor pool) |

`onRunEnd` is **not** called on reload; `dispose` is **not** called at run end. Per-call `agent.run({ tools })` providers get `onRunEnd`, not the reload `dispose` walk.

`getTools` receives:

| Field                 | Source                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| `agentId`             | The agent being run                                                       |
| `agentCallId`         | Stable id for this episode (one per `run` / `stream`)                     |
| `memoryScope`         | Conversation key for this episode                                         |
| `projectRoot?`        | ADL project root when loaded via `loadAdlProject` (or set on the runtime) |
| `workflow?`           | `{ workflowRunId, stepId }` when inside a workflow                        |
| `toolProviderContext` | The raw value from `agent.run({ toolProviderContext })`                   |

The framework never parses or validates `toolProviderContext`. If you want Zod defaults, call `.parse()` yourself at the start of `getTools`.

`contextSchema` and `listTools` are introspection-only (inspection UI / settings). The runtime never reads them. Skip `listTools` when the tool names themselves depend on a real context — the inspector treats a missing `listTools` as "cannot list" rather than calling `getTools` with a fabricated context.

A provider can be a class (constructor state, other interfaces) or a function wrapped with `createToolProvider`. Classes are the documented pattern for run-scoped state keyed by `agentCallId`.

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

## Resolution Order

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

Pass sandbox **policy** (`allowWrite`, …) to [`createWorkspaceToolProvider`](/guides/tools/) to use the process pool (file + bash + `fetchUrl` sharing one `cwd`). Combine a workspace provider with another source when an agent needs something beyond that surface.

## Related

- [ToolProvider](/api/interfaces/toolprovider/), [createToolProvider](/api/functions/createtoolprovider/), [combineToolProviders](/api/functions/combinetoolproviders/)
- [Sandboxed Tools](/guides/tools/) — `@agent-dev-lab/tools`
- [Agents](/core/agents/) — `adl.createAgent`, `stopWhen`, memory
