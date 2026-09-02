import type { ToolSet } from "ai";

import type { AgentWorkflowScope } from "../agent/types";
import { resolveToolSource, type ExtendedToolProviderContext, type ToolProvider } from "./provider";

/**
 * Builds the {@link ExtendedToolProviderContext} passed to every {@link ToolProvider}, and
 * resolves/merges runtime, definition, and per-call tool sources into the final `ToolSet` for a
 * turn. Extracted from `AgentImpl#executeTurn` — this is "how does a turn get its tools," not
 * "how does a turn talk to the model," so it lives with the rest of the `ToolProvider` system
 * rather than inline in the turn-execution flow.
 *
 * `toolProviderContext` is passed through raw, unparsed and unvalidated — that's each
 * `ToolProvider`'s own job (see `createToolProvider`'s doc comment).
 */
export async function resolveAgentTools<ToolProviderContext, Tools extends ToolSet>(options: {
  agentId: string;
  memoryScope: string;
  runtimeTools: ToolSet;
  definitionTools: Tools | ToolProvider<Tools, ToolProviderContext> | undefined;
  inputTools: ToolSet | ToolProvider<ToolSet> | undefined;
  toolProviderContext?: ToolProviderContext;
  workflow?: AgentWorkflowScope;
}): Promise<{ tools: ToolSet; toolProviderContext: ToolProviderContext | undefined }> {
  // Cast: `ToolProviderContext` is unresolved here, so TS can't evaluate
  // `ToolProviderContextField<ToolProviderContext>`'s conditional (required vs. optional key)
  // against this literal — a deferred conditional type checked inside a generic function body,
  // not resolvable without a concrete `ToolProviderContext`. See `ToolProviderContextField`'s
  // doc comment in `./provider`.
  const ctx = {
    agentId: options.agentId,
    memoryScope: options.memoryScope,
    toolProviderContext: options.toolProviderContext,
    ...(options.workflow ? { workflow: options.workflow } : {}),
  } as ExtendedToolProviderContext<ToolProviderContext>;

  const [definitionTools, inputTools] = await Promise.all([
    resolveToolSource(options.definitionTools, ctx),
    resolveToolSource(options.inputTools, ctx),
  ]);

  return {
    tools: { ...options.runtimeTools, ...definitionTools, ...inputTools },
    toolProviderContext: options.toolProviderContext,
  };
}
