import {
  AdlError,
  tool,
  type ExtendedToolProviderContext,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
  type Workflow,
} from "@agent-dev-lab/core";
import path from "node:path";
import { z } from "zod";

import { resolveAllowReadList, resolveAllowWriteList } from "../fs-bounds.ts";
import { UNBOUNDED_ALLOW_READ, type ModelAllowRead } from "../unbounded-allow-read.ts";
import type { BashExecutor, BashExecutorResult } from "./executor.ts";
import {
  acquireBashExecutor,
  bashExecutorPoolKeyFor,
  releaseBashExecutor,
  type BashSandboxBackend,
  type BashSandboxPolicy,
} from "./executor-pool.ts";
import {
  BASH_TOOL_DESCRIPTION,
  createBashTool,
  DEFAULT_TIMEOUT_MS,
  type BashTools,
} from "./tools.ts";

export { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";
export type { ModelAllowRead } from "../unbounded-allow-read.ts";

export const bashSafetyCheckInputSchema = z.object({
  command: z.string(),
  cwd: z.string(),
});
export type BashSafetyCheckInput = z.infer<typeof bashSafetyCheckInputSchema>;

export const bashSafetyVerdictSchema = z.object({
  safe: z.boolean(),
  reason: z.string(),
});
export type BashSafetyCheckVerdict = z.infer<typeof bashSafetyVerdictSchema>;

/**
 * A `Workflow` taking `{ command, cwd }` and returning `{ safe, reason }` — e.g. built via
 * `adl.createWorkflow({ inputSchema: bashSafetyCheckInputSchema, outputSchema:
 * bashSafetyVerdictSchema, run: ... })`. Concretely typed (not the `Workflow<unknown, unknown>`
 * widening a heterogeneous registry like `AdlProjectConfig.workflows` needs) — this is one
 * fixed shape, so the compiler checks a passed-in workflow's input/output for real.
 *
 * A `Workflow`, not a bare `Agent`: it's plain async TypeScript, so the check can call one
 * agent, chain a cheap heuristic pre-filter before an LLM judge, retry, or combine several
 * checks — not just one chat-style agent turn.
 */
export type BashSafetyCheckWorkflow = Workflow<BashSafetyCheckInput, BashSafetyCheckVerdict>;

async function runSafetyCheck(
  safetyCheck: BashSafetyCheckWorkflow,
  input: BashSafetyCheckInput,
): Promise<BashSafetyCheckVerdict> {
  try {
    // `workflow.run`'s outputSchema is already validated by the runtime before `.result`
    // resolves (a mismatch rejects) — no need to re-check the shape here. `isolated: true`
    // (see `conversation-title.ts` for the same pattern) keeps this from inheriting the
    // calling workflow's `workflowRunId` — without it, this run's own `workflow_started`
    // clobbers the parent run's stored `workflow_id` in the store (sqlite's ON CONFLICT
    // UPDATE), mislabeling and effectively hiding the parent run.
    return await safetyCheck.run(input, { isolated: true }).result;
  } catch (error) {
    return {
      safe: false,
      reason: `Safety check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The `describeBashEnv` tool's payload — see `createBashToolProvider`. */
export interface BashAccessInfo {
  /** The working directory this call's `bash` tool actually runs commands in. */
  cwd: string;
  /** The wall-clock timeout (ms) this call's `bash` tool actually enforces. */
  timeoutMs: number;
  backend: string;
  allowWrite: string[];
  /**
   * Paths reads are confined to, or {@link UNBOUNDED_ALLOW_READ} when the executor is not
   * bounding reads. Always the resolved default — never `null` or omitted.
   */
  allowRead: ModelAllowRead;
  /** Paths hidden from reads. Empty when the caller set no extra denials. */
  denyRead: string[];
  /** Paths denied write access. Empty when the caller set none. */
  denyWrite: string[];
  network: {
    allowNetwork: boolean;
    allowedDomains: string[];
    deniedDomains: string[];
  };
}

function resolvedPathList(value: readonly string[] | null | undefined): string[] {
  return value == null ? [] : [...value];
}

function resolvedAllowRead(value: string[] | typeof UNBOUNDED_ALLOW_READ): ModelAllowRead {
  return value;
}

/**
 * Resolve {@link BashExecutor.describe} into the values actually in effect, filling omitted
 * policy fields with the same defaults the executors apply. {@link UNBOUNDED_ALLOW_READ}
 * means host-wide reads; `[]` means nothing readable. The model sees this object — it
 * should not have to apply this package's `null`/`[]`/omitted rules itself.
 */
export function describeBashAccess(
  executor: BashExecutor,
  cwd: string,
  timeoutMs: number,
): BashAccessInfo {
  const described = executor.describe();
  return {
    cwd,
    timeoutMs,
    backend: described.backend,
    allowWrite: described.allowWrite,
    allowRead: resolvedAllowRead(described.allowRead),
    denyRead: resolvedPathList(described.denyRead),
    denyWrite: resolvedPathList(described.denyWrite),
    network: {
      allowNetwork: described.network.allowNetwork,
      allowedDomains: resolvedPathList(described.network.allowedDomains),
      deniedDomains: resolvedPathList(described.network.deniedDomains),
    },
  };
}

const describeBashEnvDescription =
  "Report the bash sandbox working directory, path permissions, and network access.";

const describeBashEnvInputSchema = z.object({});
type DescribeBashEnvInput = z.infer<typeof describeBashEnvInputSchema>;

const POLICY_KEYS = [
  "allowWrite",
  "allowRead",
  "denyRead",
  "denyWrite",
  "allowedDomains",
  "deniedDomains",
  "allowNetwork",
  "allowEnv",
] as const satisfies readonly (keyof BashSandboxPolicy)[];

export interface BashToolProviderContext extends Partial<BashSandboxPolicy> {
  /** Overrides `options.cwd` for this call. */
  cwd?: string;
  /** Overrides `options.timeoutMs` for this call. */
  timeoutMs?: number;
}

export interface BashToolProviderOptions extends Partial<BashSandboxPolicy> {
  /**
   * Isolation strategy. Optional when policy (`allowWrite`, …) is provided — the provider
   * acquires a shared executor from the process pool. Escape hatch for tests / custom
   * backends; mutually exclusive with policy fields and `backend`.
   */
  executor?: BashExecutor;
  /** Sandbox backend when using the pool. Default `"asrt"`. Invalid with `executor`. */
  backend?: BashSandboxBackend;
  /** Default working directory when a call's context doesn't specify one. */
  cwd?: string;
  /** Default wall-clock timeout (ms) when a call's context doesn't specify one. */
  timeoutMs?: number;
  /**
   * Optional AI-based safety check layered on top of the sandbox — catches non-filesystem
   * dangerous intent (fork bombs, resource exhaustion, ...) a filesystem/network jail can't.
   * See `BashSafetyCheckWorkflow`'s doc comment.
   */
  safetyCheck?: BashSafetyCheckWorkflow;
}

/** Reported by `createBashToolProvider`'s `describeBashEnv` tool. */
export type DescribeBashEnvTool = Tool<DescribeBashEnvInput, { bashAccess: BashAccessInfo }>;

/**
 * `createBashToolProvider`'s tools — `bash` plus `describeBashEnv`. Named for its actual scope
 * (this sandbox's own config), not a generic "describeEnvironment" — a project may have other
 * tools with their own network access this doesn't cover, so the name shouldn't imply
 * completeness. A plain object-literal type alias (not `interface ... extends BashTools`): an
 * interface anywhere in the shape (even via `extends`/`&`) loses the implicit index signature
 * `ToolProvider<Tools extends ToolSet>` needs, verified directly — only a `type X = { ... }`
 * object literal keeps it. `BashTools["bash"]` (an indexed-access reference) avoids retyping
 * the `bash` tool's own signature by hand.
 */
export type BashProviderTools = {
  bash: BashTools["bash"];
  describeBashEnv: DescribeBashEnvTool;
};

function policyFieldsSet(
  values: Partial<Record<(typeof POLICY_KEYS)[number], unknown>>,
): (typeof POLICY_KEYS)[number][] {
  return POLICY_KEYS.filter((key) => values[key] !== undefined);
}

/**
 * Merge construct-time defaults with per-call context. Omitted `allowWrite` / `allowRead`
 * become `[cwd]` via {@link resolveAllowWriteList} / {@link resolveAllowReadList} — explicit
 * lists (and {@link UNBOUNDED_ALLOW_READ} for host-wide reads) do not follow a later cwd
 * change. `null` / `[]` mean no reads. `allowRead` is not unioned with `allowWrite`.
 */
export function mergePolicy(
  cwd: string,
  defaults: Partial<BashSandboxPolicy>,
  context: Partial<BashSandboxPolicy> | undefined,
): BashSandboxPolicy {
  const resolvedCwd = path.resolve(cwd);
  const allowWrite = resolveAllowWriteList({
    anchor: resolvedCwd,
    allowWrite: context?.allowWrite ?? defaults.allowWrite,
    whenOmitted: "anchor",
  })!;
  const rawAllowRead = Object.hasOwn(context ?? {}, "allowRead")
    ? context!.allowRead
    : Object.hasOwn(defaults, "allowRead")
      ? defaults.allowRead
      : undefined;
  const allowRead = resolveAllowReadList({
    anchor: resolvedCwd,
    allowRead: rawAllowRead,
  });
  return {
    allowWrite,
    allowRead,
    denyRead: context?.denyRead ?? defaults.denyRead,
    denyWrite: context?.denyWrite ?? defaults.denyWrite,
    allowedDomains: context?.allowedDomains ?? defaults.allowedDomains,
    deniedDomains: context?.deniedDomains ?? defaults.deniedDomains,
    allowNetwork: context?.allowNetwork ?? defaults.allowNetwork,
    allowEnv: context?.allowEnv ?? defaults.allowEnv,
  };
}

/**
 * Resolve the {@link BashExecutor} for a bash/workspace getTools call.
 * Escape-hatch `executor` wins only when no policy fields are set on options or context.
 */
export function resolveBashExecutorForCall(options: {
  executor?: BashExecutor;
  backend?: BashSandboxBackend;
  defaults: Partial<BashSandboxPolicy> & Pick<BashToolProviderOptions, "allowWrite">;
  context: (Partial<BashSandboxPolicy> & { cwd?: string }) | undefined;
  /** Working directory used to fill omitted allowWrite/allowRead. Required when pooling. */
  cwd: string | undefined;
  projectRoot: string | undefined;
  /** Keys this provider instance already holds (dispose will release once each). */
  heldKeys?: ReadonlySet<string>;
}): { executor: BashExecutor; poolKey?: string } {
  const contextPolicy = policyFieldsSet(options.context ?? {});
  const defaultPolicy = policyFieldsSet(options.defaults);
  const anyPolicy = contextPolicy.length > 0 || defaultPolicy.length > 0;

  if (options.executor) {
    if (options.backend !== undefined) {
      throw new AdlError(
        "INVALID_INPUT",
        "createBashToolProvider: pass either executor or backend, not both.",
      );
    }
    if (anyPolicy) {
      throw new AdlError(
        "INVALID_INPUT",
        "createBashToolProvider: pass either executor or sandbox policy fields " +
          `(${[...new Set([...defaultPolicy, ...contextPolicy])].join(", ")}), not both.`,
      );
    }
    return { executor: options.executor };
  }

  const cwd = options.context?.cwd ?? options.cwd;
  if (!cwd) {
    throw new AdlError(
      "INVALID_INPUT",
      "createBashToolProvider: no cwd given — pass options.cwd as a default, or " +
        "toolProviderContext.cwd per call (needed to default allowWrite/allowRead).",
    );
  }
  const policy = mergePolicy(cwd, options.defaults, options.context);
  const backend = options.backend ?? "asrt";
  if (!options.projectRoot) {
    throw new AdlError(
      "INVALID_INPUT",
      "Pooled bash executor requires projectRoot on the tool-provider context " +
        "(LoadedAdlProject attaches it; or pass createAdlRuntime({ projectRoot })).",
    );
  }
  const key = bashExecutorPoolKeyFor({
    projectRoot: options.projectRoot,
    backend,
    policy,
  });
  const alreadyHeld = options.heldKeys?.has(key) ?? false;
  const acquired = acquireBashExecutor({
    projectRoot: options.projectRoot,
    backend,
    policy,
    alreadyHeld,
  });
  return { executor: acquired.executor, poolKey: acquired.key };
}

/**
 * `ToolProvider` wrapping `createBashTool` so `cwd`/`timeoutMs`/sandbox policy can be set per
 * `agent.run()` call via `toolProviderContext` (set by the workflow/host, not the model).
 * Pass either a pre-built `executor` (escape hatch) or policy (`allowWrite`, …) to use the
 * process-scoped pool. The "command-only sandbox" primitive — no file jail attached; see
 * `createWorkspaceToolProvider` for the combined file+bash+fetch surface.
 */
export function createBashToolProvider(
  options: BashToolProviderOptions,
): ToolProvider<BashProviderTools, BashToolProviderContext | undefined> {
  // Fail closed at construction when options alone are already contradictory.
  if (options.executor) {
    resolveBashExecutorForCall({
      executor: options.executor,
      backend: options.backend,
      defaults: options,
      context: undefined,
      cwd: options.cwd,
      projectRoot: undefined,
    });
  }

  const heldKeys = new Set<string>();

  return {
    contextSchema: z
      .object({
        cwd: z.string(),
        timeoutMs: z.number(),
        allowWrite: z.array(z.string()),
        allowRead: z.union([z.array(z.string()), z.null(), z.literal(UNBOUNDED_ALLOW_READ)]),
        denyRead: z.array(z.string()),
        denyWrite: z.array(z.string()),
        allowedDomains: z.array(z.string()),
        deniedDomains: z.array(z.string()),
        allowNetwork: z.boolean(),
        allowEnv: z.union([z.literal(true), z.array(z.union([z.string(), z.instanceof(RegExp)]))]),
      })
      .partial(),
    listTools(): ToolProviderToolSummary[] {
      return [
        { name: "bash", description: BASH_TOOL_DESCRIPTION },
        { name: "describeBashEnv", description: describeBashEnvDescription },
      ];
    },
    getTools(ctx: ExtendedToolProviderContext<BashToolProviderContext | undefined>) {
      const cwd = ctx.toolProviderContext?.cwd ?? options.cwd;
      if (!cwd) {
        throw new AdlError(
          "INVALID_INPUT",
          "createBashToolProvider: no cwd given — pass options.cwd as a default, or " +
            "toolProviderContext.cwd per call.",
        );
      }
      const timeoutMs = ctx.toolProviderContext?.timeoutMs ?? options.timeoutMs;
      const resolvedTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const { executor, poolKey } = resolveBashExecutorForCall({
        executor: options.executor,
        backend: options.backend,
        defaults: options,
        context: ctx.toolProviderContext,
        cwd: options.cwd,
        projectRoot: ctx.projectRoot,
        heldKeys,
      });
      if (poolKey) {
        heldKeys.add(poolKey);
      }

      const base = createBashTool({ executor, cwd, timeoutMs });

      const describeBashEnv: DescribeBashEnvTool = tool({
        description: describeBashEnvDescription,
        inputSchema: describeBashEnvInputSchema,
        execute: async () => ({
          bashAccess: describeBashAccess(executor, cwd, resolvedTimeoutMs),
        }),
      });

      if (!options.safetyCheck) {
        return { ...base, describeBashEnv };
      }

      const safetyCheck = options.safetyCheck;
      const safeBash: BashTools["bash"] = tool({
        description: base.bash.description,
        inputSchema: base.bash.inputSchema,
        execute: async function* (input, toolOptions) {
          const verdict = await runSafetyCheck(safetyCheck, { command: input.command, cwd });
          if (!verdict.safe) {
            const blocked: BashExecutorResult = {
              done: true,
              stdout: "",
              stderr: `Blocked by safety check: ${verdict.reason}`,
              exitCode: 1,
              truncated: false,
            };
            yield blocked;
            return;
          }
          // Calls the executor directly (not `base.bash.execute`) — its return type is a
          // concrete AsyncGenerator, not the AI SDK's broader `Tool.execute` return union
          // (`AsyncIterable | PromiseLike | OUTPUT`), which `yield*` can't statically iterate.
          yield* executor.run(["/bin/bash", "-c", input.command], {
            cwd,
            timeoutMs: resolvedTimeoutMs,
            signal: toolOptions.abortSignal,
          });
        },
      });

      return { bash: safeBash, describeBashEnv };
    },
    async dispose() {
      const keys = [...heldKeys];
      heldKeys.clear();
      await Promise.all(keys.map((key) => releaseBashExecutor(key)));
    },
  };
}
