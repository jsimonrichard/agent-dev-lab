import type { ToolSet } from "ai";
import { z } from "zod";

import type { AgentWorkflowScope } from "../agent/types";

/**
 * `{ toolProviderContext?: T }` when `undefined` is a valid `T` (including the default
 * `unknown`), else `{ toolProviderContext: T }`. Shared by {@link ExtendedToolProviderContext}
 * and `AgentRunInput` so the two can never drift: if a project's `ToolProviderContext` type
 * doesn't allow `undefined`, both the envelope passed to a {@link ToolProvider} *and*
 * `agent.run`'s input require it.
 */
export type ToolProviderContextField<ToolProviderContext> = undefined extends ToolProviderContext
  ? { toolProviderContext?: ToolProviderContext }
  : { toolProviderContext: ToolProviderContext };

/**
 * Passed to a {@link ToolProvider} when resolving tools for a call. Generic so
 * {@link createToolProvider} (and `AgentDefinition.tools` directly) can narrow
 * `toolProviderContext` for an author, but the version actually *stored* — via
 * `AgentRunInput.tools`'s bare `ToolProvider<Tools>` — stays at the default
 * `ToolProviderContext = unknown`. Not for widening (registries widen to {@link AnyAgent},
 * whose `any` params tolerate a parameterized copy just fine); it's because a per-call
 * `tools` override is deliberately independent of the agent's own `ToolProviderContext` — a
 * caller can pass any provider here regardless of what the agent it's overriding declares.
 * See `notes/tool-sandboxing.md`.
 *
 * This is always the **raw** value a caller passed to `AgentRunInput.toolProviderContext` — the
 * framework never parses or validates it. A provider that wants Zod validation/defaults calls
 * `.parse()` itself as the first line of `getTools` (see {@link createToolProvider}'s doc
 * comment for the recipe).
 */
export type ExtendedToolProviderContext<ToolProviderContext = unknown> = {
  agentId: string;
  memoryScope: string;
  workflow?: AgentWorkflowScope;
} & ToolProviderContextField<ToolProviderContext>;

/**
 * Resolves a {@link ToolSet} from call context instead of a fixed object — for tools whose
 * availability or configuration genuinely depends on the call (e.g. which sandbox root a
 * dangerous tool should use for this run). See `notes/tool-sandboxing.md`.
 *
 * A true interface (not a bare function type) so a provider can be a class instance — useful
 * for anything that wants constructor state (a connection pool, a cache) or that needs to
 * implement other interfaces alongside this one — not just an inline closure:
 *
 * ```ts
 * class SandboxToolProvider implements ToolProvider<ToolSet, SandboxContext> {
 *   constructor(private readonly pool: SandboxPool) {}
 *   async getTools(ctx: ExtendedToolProviderContext<SandboxContext>) {
 *     const sandbox = await this.pool.acquire(ctx.toolProviderContext?.root);
 *     return { bash: createBashTool({ sandbox }) };
 *   }
 * }
 * ```
 *
 * Use {@link createToolProvider} to wrap a plain function into this shape instead, or
 * {@link combineToolProviders} to merge several sources into one.
 *
 * Accepted wherever a plain {@link ToolSet} is (`AgentDefinition.tools`, `AgentRunInput.tools`);
 * resolved once per `agent.run` / `agent.stream` call, merged before `streamText`.
 */
export interface ToolProvider<Tools extends ToolSet = ToolSet, ToolProviderContext = unknown> {
  /**
   * Optional — pure introspection metadata, e.g. for a settings UI to build a form from. Never
   * read or parsed by the framework itself; parsing, if you want it, is your own `getTools`'s
   * job (see {@link createToolProvider}'s doc comment for the recipe). `agent.tools` exposes
   * this on the bound `Agent` so a caller can find it without knowing which agent it's looking at.
   *
   * Typed `z.ZodType<unknown, ToolProviderContext>` — output left unconstrained (the framework
   * never parses, so there's nothing to pin it to), but **input pinned to `ToolProviderContext`**,
   * the exact raw value `getTools` receives via `ctx.toolProviderContext`. So a schema describing
   * a different shape than `getTools` actually expects is a compile error, not a silent drift —
   * verified via an isolated repro (a mismatched schema is rejected; `Tools` inference and
   * `AgentDefinition.tools`, which is never widened, are both unaffected). `ToolProviderContext`
   * appears fully generic here whether or not this position ends up widened: `AgentDefinition.tools`
   * never widens at all, and `Agent.tools` (mirroring it verbatim) widens along with the rest of
   * the agent into {@link AnyAgent} — `any` in every slot, so a concretely-typed `contextSchema`
   * here needs no separate erasure to tolerate that. `AgentRunInput.tools`'s bare `ToolProvider<Tools>`
   * is the one exception, defaulting `ToolProviderContext` to `unknown` — not for widening, see
   * {@link ExtendedToolProviderContext}'s doc comment.
   */
  contextSchema?: z.ZodType<unknown, ToolProviderContext>;
  getTools(ctx: ExtendedToolProviderContext<ToolProviderContext>): Tools | Promise<Tools>;
}

/**
 * Typed authoring helper: wrap a plain function — written against a known
 * `ToolProviderContext` shape, matching whatever `AgentRunInput<ToolProviderContext>` your
 * agent uses — into a {@link ToolProvider} object, safe to assign to `AgentDefinition.tools` /
 * `AgentRunInput.tools`. Takes a config object (not positional args) so future additions don't
 * require reordering existing call sites.
 *
 * ```ts
 * type SandboxContext = { root: string };
 * const tools = createToolProvider<SandboxContext>({
 *   getTools: (ctx) => ({
 *     bash: createBashTool({ root: ctx.toolProviderContext?.root ?? "." }),
 *   }),
 * });
 * ```
 *
 * `ToolProviderContext` is the only type parameter you need to pass explicitly — `Tools` is
 * inferred from whatever `getTools` returns. Prefer implementing {@link ToolProvider} directly
 * (e.g. as a class) when the provider needs its own state.
 *
 * Narrowing `toolProviderContext` this way is a trust boundary, not a guarantee — nothing
 * stops a caller from passing an `AgentRunInput.toolProviderContext` of a different shape at
 * runtime. It mirrors how the AI SDK itself types `streamText`'s `experimental_context` as
 * `unknown` for the same reason.
 *
 * The framework never validates `toolProviderContext` on your behalf — if you want Zod
 * validation with defaults, parse it yourself as the first line of `getTools`, and pass the
 * same schema as `contextSchema` so it's discoverable via `ToolProvider.contextSchema` (e.g.
 * for a settings UI to build a form from) without the framework ever calling it itself. The
 * schema's *input* shape must match `ToolProviderContext` — a mismatched schema is a compile
 * error, not a silent drift:
 *
 * ```ts
 * const sandboxSchema = z.object({ root: z.string().default("/tmp") });
 * const tools = createToolProvider<z.input<typeof sandboxSchema>>({
 *   contextSchema: sandboxSchema,
 *   getTools: (ctx) => {
 *     const { root } = sandboxSchema.parse(ctx.toolProviderContext);
 *     return { bash: createBashTool({ root }) };
 *   },
 * });
 * ```
 */
export function createToolProvider<
  ToolProviderContext = unknown,
  Tools extends ToolSet = ToolSet,
>(config: {
  getTools: (ctx: ExtendedToolProviderContext<ToolProviderContext>) => Tools | Promise<Tools>;
  contextSchema?: z.ZodType<unknown, ToolProviderContext>;
}): ToolProvider<Tools, ToolProviderContext> {
  return { getTools: config.getTools, contextSchema: config.contextSchema };
}

/**
 * The `Tools` shape contributed by one {@link combineToolProviders} source. The provider
 * branch matches `ToolProvider<infer Tools, any>` — `any` (not `unknown`) specifically,
 * since `ToolProviderContext` sits in a contravariant position (`getTools`'s parameter);
 * matching against `unknown` there would fail to match any concretely-typed
 * `ToolProviderContext` (the same class of variance issue documented on `ToolProvider`
 * itself), silently dropping that source's `Tools` from the merge instead of contributing
 * it. Only `Tools` is extracted here, so the imprecision is harmless.
 */
type ToolSourceTools<Source> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  Source extends ToolProvider<infer Tools, any>
    ? Tools
    : Source extends ToolSet
      ? Source
      : Record<string, never>; // `undefined` (or anything else) contributes nothing

/** The `ToolProviderContext` shape a single {@link combineToolProviders} source declares. */
type ToolSourceContext<Source> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see ToolSourceTools above
  Source extends ToolProvider<any, infer ToolProviderContext> ? ToolProviderContext : unknown;

/** https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types */
type UnionToIntersection<Union> = (Union extends unknown ? (arg: Union) => void : never) extends (
  arg: infer Intersection,
) => void
  ? Intersection
  : never;

/**
 * The combined `Tools` shape across every {@link combineToolProviders} source — the union of
 * each source's own `ToolSourceTools`, merged into one intersection (falling back to the bare
 * `ToolSet` constraint if that intersection somehow doesn't satisfy it, which shouldn't happen
 * for well-typed sources but keeps this from ever failing to typecheck at the declaration site).
 */
type MergedTools<Sources extends Record<string, unknown>> =
  UnionToIntersection<ToolSourceTools<Sources[keyof Sources]>> extends infer Merged
    ? Merged extends ToolSet
      ? Merged
      : ToolSet
    : ToolSet;

/**
 * The combined, **namespaced** `ToolProviderContext` shape across every
 * {@link combineToolProviders} source — one optional key per source name, holding that source's
 * own declared context type. Namespacing (rather than flat-merging every source's context into
 * one object) means two unrelated sources can never collide on a field name — each only ever
 * sees its own key's slice, never a sibling's.
 */
type MergedContext<Sources extends Record<string, unknown>> = {
  [K in keyof Sources]?: ToolSourceContext<Sources[K]>;
};

/**
 * Merges several named tool sources — plain {@link ToolSet}s and/or {@link ToolProvider}s —
 * into one `ToolProvider`. Keyed by name (not variadic) so the combined context can be
 * **namespaced**: a caller passes `toolProviderContext: { <name>: <that source's own context>,
 * ... }`, and each source only ever receives its own slice under `ctx.toolProviderContext`,
 * never a sibling's — this makes field-name collisions between independently-authored
 * providers structurally impossible, unlike a flat merge of every source's context into one
 * object.
 *
 * ```ts
 * const tools = combineToolProviders({
 *   sandbox: createToolProvider<SandboxContext>((ctx) => ({ bash: ... })),
 *   search: createToolProvider<SearchContext>((ctx) => ({ webSearch: ... })),
 * });
 * // agent.run({ toolProviderContext: { sandbox: { root: "/tmp" }, search: { apiKey: "..." } } })
 * ```
 *
 * A source that needs no context at all (a plain `ToolSet`, or a context-less `ToolProvider`)
 * still needs a key in the record — its corresponding `toolProviderContext` slot just goes
 * unused.
 *
 * The combined `contextSchema` (introspection metadata, same as on any {@link ToolProvider}) is
 * `z.object({ <name>: source.contextSchema, ... })` for whichever sources declare one — same
 * keys the runtime routing above actually uses, so introspection and behavior never drift.
 * Sources with no `contextSchema` of their own just don't get a key in it.
 *
 * Each source is resolved (in parallel, against its own slice of `ctx`) via
 * {@link resolveToolSource}, then combined the same way the runtime already merges runtime /
 * definition / per-call tools: `Object.assign({}, ...resolved)`, so a later source's tool wins
 * over an earlier one with the same name. `Tools` (the actual AI SDK tool names) are still
 * merged flatly across all sources — only `ToolProviderContext` is namespaced.
 */
export function combineToolProviders<
  const Sources extends Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see ToolSourceTools above
    ToolSet | ToolProvider<ToolSet, any> | undefined
  >,
>(sources: Sources): ToolProvider<MergedTools<Sources>, MergedContext<Sources>> {
  const schemaShape = Object.fromEntries(
    Object.entries(sources).flatMap(([key, source]) => {
      const schema =
        source && typeof source.getTools === "function" ? source.contextSchema : undefined;
      return schema ? [[key, schema] as const] : [];
    }),
  );
  const contextSchema = Object.keys(schemaShape).length > 0 ? z.object(schemaShape) : undefined;

  return {
    contextSchema,
    async getTools(ctx) {
      const raw = ctx.toolProviderContext;
      const resolved = await Promise.all(
        Object.entries(sources).map(([key, source]) =>
          resolveToolSource(source, { ...ctx, toolProviderContext: raw?.[key] }),
        ),
      );
      return Object.assign({}, ...resolved);
    },
  };
}

/**
 * Calls a {@link ToolProvider}'s `getTools` with `ctx`, or returns a plain {@link ToolSet} as-is.
 */
export async function resolveToolSource<Tools extends ToolSet, ToolProviderContext = unknown>(
  source: Tools | ToolProvider<Tools, ToolProviderContext> | undefined,
  ctx: ExtendedToolProviderContext<ToolProviderContext>,
): Promise<Tools | Record<string, never>> {
  if (!source) {
    return {};
  }
  if (typeof source.getTools === "function") {
    return await source.getTools(ctx);
  }
  // Cast: `typeof x.getTools === "function"` isn't a construct TS recognizes for narrowing a
  // union, so `source` is still `Tools | ToolProvider<...>` here even though the `if` above
  // already excluded the `ToolProvider` case at runtime.
  return source as Tools;
}
