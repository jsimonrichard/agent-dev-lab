import type { ToolSet } from "ai";
import { z } from "zod";

import type { AgentWorkflowScope } from "../agent/types";
import type { MaybePromise } from "../maybe-promise";

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
 *
 * This is always the **raw** value a caller passed to `AgentRunInput.toolProviderContext` — the
 * framework never parses or validates it. A provider that wants Zod validation/defaults calls
 * `.parse()` itself as the first line of `getTools` (see {@link createToolProvider}'s doc
 * comment for the recipe).
 *
 * `agentCallId` is the id of this `agent.run` / `agent.stream` episode (not the conversation).
 * `projectRoot` is the ADL project directory when the runtime was loaded via
 * {@link LoadedAdlProject} (or set explicitly on `createAdlRuntime`); omitted for bare
 * runtimes that never attached one.
 */
export type ExtendedToolProviderContext<ToolProviderContext = unknown> = {
  agentId: string;
  /** Stable id for this agent episode — one per `agent.run` / `agent.stream` call. */
  agentCallId: string;
  memoryScope: string;
  /** Absolute ADL project root when known; see {@link RuntimeServices.projectRoot}. */
  projectRoot?: string;
  workflow?: AgentWorkflowScope;
} & ToolProviderContextField<ToolProviderContext>;

/**
 * Resolves a {@link ToolSet} from call context instead of a fixed object — for tools whose
 * availability or configuration genuinely depends on the call (e.g. which sandbox root a
 * dangerous tool should use for this run).
 *
 * A true interface (not a bare function type) so a provider can be a class instance — useful
 * for anything that wants constructor state (a connection pool, a cache) or that needs to
 * implement other interfaces alongside this one — not just an inline closure:
 *
 * ```ts
 * class KernelToolProvider implements ToolProvider {
 *   #byRun = new Map<string, Kernel>();
 *   async getTools(ctx) {
 *     const kernel = this.#byRun.get(ctx.agentCallId) ?? startKernel();
 *     this.#byRun.set(ctx.agentCallId, kernel);
 *     return { exec: createExecTool({ kernel }) };
 *   }
 *   async onRunEnd(ctx) {
 *     await this.#byRun.get(ctx.agentCallId)?.stop();
 *     this.#byRun.delete(ctx.agentCallId);
 *   }
 *   async dispose() {
 *     await Promise.all([...this.#byRun.values()].map((k) => k.stop()));
 *     this.#byRun.clear();
 *   }
 * }
 * ```
 *
 * Two lifetimes:
 * - {@link ToolProvider.onRunEnd} — this *agent episode* finished (`agentCallId`).
 * - {@link ToolProvider.dispose} — this *provider instance* is going away (project reload /
 *   unload). Process-scoped resources (e.g. a bash executor pool) release here, not in
 *   `onRunEnd`.
 *
 * Use {@link createToolProvider} to wrap a plain function into this shape instead, or
 * {@link combineToolProviders} to merge several sources into one.
 *
 * Accepted wherever a plain {@link ToolSet} is (`AgentDefinition.tools`, `AgentRunInput.tools`);
 * resolved once per `agent.run` / `agent.stream` call, merged before `streamText`.
 */
/** Minimal tool identity for introspection — see {@link ToolProvider.listTools}. */
export interface ToolProviderToolSummary {
  name: string;
  description?: string;
}

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
  /**
   * Optional — static tool names (and descriptions) for a settings UI to list, for a provider
   * whose tool set doesn't actually vary by call context. Deliberately *not* passed an
   * {@link ExtendedToolProviderContext}: an inspector calling this has no real `agentId` /
   * `memoryScope` / `toolProviderContext` to offer, only a fabricated one, so this exists
   * precisely to avoid needing one. Never read or called by the framework itself — `getTools`
   * is still the only thing `agent.run` / `agent.stream` resolve against.
   *
   * Skip this when enumerating tool names genuinely requires a resolved context (e.g. the set of
   * tools itself, not just their behavior, differs per `toolProviderContext`); an inspector should
   * treat a missing `listTools` as "can't introspect this provider" rather than guessing by
   * calling `getTools` with a made-up context.
   */
  listTools?(): ToolProviderToolSummary[];
  getTools(ctx: ExtendedToolProviderContext<ToolProviderContext>): MaybePromise<Tools>;
  /**
   * Optional — called when this *agent episode* finishes (success, failure, or abort).
   * `ctx` is the same envelope {@link ToolProvider.getTools} received, including
   * {@link ExtendedToolProviderContext.agentCallId}. Safe to call when nothing was
   * acquired (no-op). Not called on project reload — use {@link ToolProvider.dispose}.
   */
  onRunEnd?(ctx: ExtendedToolProviderContext<ToolProviderContext>): MaybePromise<void>;
  /**
   * Optional — called when this *provider instance* is going away (outgoing registry after
   * a successful project reload, or {@link LoadedAdlProject.dispose} / host unload).
   * Safe to call more than once. Not called at the end of an agent episode — use
   * {@link ToolProvider.onRunEnd}.
   */
  dispose?(): MaybePromise<void>;
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
  getTools: (ctx: ExtendedToolProviderContext<ToolProviderContext>) => MaybePromise<Tools>;
  contextSchema?: z.ZodType<unknown, ToolProviderContext>;
  listTools?(): ToolProviderToolSummary[];
  onRunEnd?(ctx: ExtendedToolProviderContext<ToolProviderContext>): MaybePromise<void>;
  dispose?(): MaybePromise<void>;
}): ToolProvider<Tools, ToolProviderContext> {
  return {
    getTools: config.getTools,
    contextSchema: config.contextSchema,
    listTools: config.listTools,
    onRunEnd: config.onRunEnd,
    dispose: config.dispose,
  };
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
/**
 * Introspection summaries contributed by one {@link combineToolProviders} source — a plain
 * {@link ToolSet}'s own keys (with each tool's `description`, when it has a string one), or a
 * nested {@link ToolProvider}'s {@link ToolProvider.listTools}, when it declares one.
 */
function toolSourceSummaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see ToolSourceTools above
  source: ToolSet | ToolProvider<ToolSet, any> | undefined,
): ToolProviderToolSummary[] {
  if (!source) {
    return [];
  }
  if (typeof source.getTools === "function") {
    // Cast: see `resolveToolSource`'s comment below — `typeof x.getTools === "function"` isn't a
    // construct TS recognizes for narrowing this union, so `source` is still the full union here.
    return (source as ToolProvider<ToolSet>).listTools?.() ?? [];
  }
  return Object.entries(source).map(([name, entry]) => ({
    name,
    description:
      typeof (entry as { description?: unknown } | undefined)?.description === "string"
        ? (entry as { description: string }).description
        : undefined,
  }));
}

/** Whether `value` is a {@link ToolProvider} (has a callable `getTools`). */
export function isToolProvider(value: unknown): value is ToolProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { getTools?: unknown }).getTools === "function"
  );
}

/**
 * Runs every async/sync callback **in parallel**, collecting failures so one throw does not
 * skip siblings. Zero errors → resolves. One → rethrows it. Several → {@link AggregateError}.
 * Completion order is not part of the contract — only that every runner is attempted.
 */
export async function settleProviderHooks(
  runners: Array<() => MaybePromise<void>>,
  message: string,
): Promise<void> {
  const results = await Promise.allSettled(
    runners.map(async (run) => {
      await run();
    }),
  );
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length === 0) {
    return;
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  throw new AggregateError(errors, message);
}

/**
 * Calls {@link ToolProvider.onRunEnd} on each distinct provider in `sources` (identity-deduped).
 * Plain {@link ToolSet}s are skipped. Errors are collected — one failure does not skip siblings.
 */
export async function invokeToolProviderOnRunEnd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- providers carry arbitrary context
  sources: ReadonlyArray<ToolSet | ToolProvider<ToolSet, any> | undefined>,
  ctx: ExtendedToolProviderContext,
): Promise<void> {
  const seen = new Set<object>();
  const runners: Array<() => MaybePromise<void>> = [];
  for (const source of sources) {
    if (!isToolProvider(source) || !source.onRunEnd) {
      continue;
    }
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    const provider = source;
    runners.push(() => provider.onRunEnd!(ctx));
  }
  await settleProviderHooks(runners, "ToolProvider.onRunEnd failed");
}

/**
 * Calls {@link ToolProvider.dispose} on each distinct provider in `sources` (identity-deduped).
 * Plain {@link ToolSet}s are skipped. Errors are collected — one failure does not skip siblings.
 */
export async function disposeToolProviders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- providers carry arbitrary context
  sources: ReadonlyArray<ToolSet | ToolProvider<ToolSet, any> | undefined>,
): Promise<void> {
  const seen = new Set<object>();
  const runners: Array<() => MaybePromise<void>> = [];
  for (const source of sources) {
    if (!isToolProvider(source) || !source.dispose) {
      continue;
    }
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    const provider = source;
    runners.push(() => provider.dispose!());
  }
  await settleProviderHooks(runners, "ToolProvider.dispose failed");
}

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
    listTools() {
      const byName = new Map<string, ToolProviderToolSummary>();
      for (const source of Object.values(sources)) {
        for (const summary of toolSourceSummaries(source)) {
          byName.set(summary.name, summary);
        }
      }
      return [...byName.values()];
    },
    async getTools(ctx) {
      const raw = ctx.toolProviderContext;
      const resolved = await Promise.all(
        Object.entries(sources).map(([key, source]) =>
          resolveToolSource(source, { ...ctx, toolProviderContext: raw?.[key] }),
        ),
      );
      return Object.assign({}, ...resolved);
    },
    async onRunEnd(ctx) {
      const raw = ctx.toolProviderContext;
      await settleProviderHooks(
        Object.entries(sources).flatMap(([key, source]) => {
          if (!isToolProvider(source) || !source.onRunEnd) {
            return [];
          }
          const provider = source;
          return [
            () =>
              provider.onRunEnd!({
                ...ctx,
                toolProviderContext: raw?.[key],
              }),
          ];
        }),
        "ToolProvider.onRunEnd failed",
      );
    },
    async dispose() {
      await disposeToolProviders(Object.values(sources));
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
