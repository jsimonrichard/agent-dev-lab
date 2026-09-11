import {
  AdlError,
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
  type Workflow,
} from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor, BashExecutorDescription, BashExecutorResult } from "./executor";
import { BASH_TOOL_DESCRIPTION, createBashTool, DEFAULT_TIMEOUT_MS, type BashTools } from "./tools";

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
export interface BashAccessInfo extends BashExecutorDescription {
  /** The working directory this call's `bash` tool actually runs commands in. */
  cwd: string;
  /** The wall-clock timeout (ms) this call's `bash` tool actually enforces. */
  timeoutMs: number;
}

export function describeBashAccess(
  executor: BashExecutor,
  cwd: string,
  timeoutMs: number,
): BashAccessInfo {
  return { cwd, timeoutMs, ...executor.describe() };
}

const describeBashEnvDescription =
  "Reports the bash sandbox's working directory, readable/writable/denied paths, and network " +
  "access. `allowRead` lists the only paths reads are confined to, or is null when reads are " +
  "not bounded at all. Call before a command you're unsure is allowed, or after one fails " +
  "unexpectedly.";

const describeBashEnvInputSchema = z.object({});
type DescribeBashEnvInput = z.infer<typeof describeBashEnvInputSchema>;

export interface BashToolProviderOptions {
  /** Isolation strategy. Required — there is no unsandboxed default. */
  executor: BashExecutor;
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

export interface BashToolProviderContext {
  /** Overrides `options.cwd` for this call. */
  cwd?: string;
  /** Overrides `options.timeoutMs` for this call. */
  timeoutMs?: number;
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

/**
 * `ToolProvider` wrapping `createBashTool` so `cwd`/`timeoutMs` can be set per `agent.run()`
 * call via `toolProviderContext` (set by the workflow/host, not the model) instead of being
 * fixed at construction time. The "command-only sandbox" primitive — no file jail attached; see
 * `createWorkspaceToolProvider` for the combined file+bash surface.
 */
export function createBashToolProvider(
  options: BashToolProviderOptions,
): ToolProvider<BashProviderTools, BashToolProviderContext | undefined> {
  return {
    contextSchema: z.object({ cwd: z.string(), timeoutMs: z.number() }).partial(),
    listTools(): ToolProviderToolSummary[] {
      return [
        { name: "bash", description: BASH_TOOL_DESCRIPTION },
        { name: "describeBashEnv", description: describeBashEnvDescription },
      ];
    },
    getTools(ctx) {
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
      const base = createBashTool({ executor: options.executor, cwd, timeoutMs });

      const describeBashEnv: DescribeBashEnvTool = tool({
        description: describeBashEnvDescription,
        inputSchema: describeBashEnvInputSchema,
        execute: async () => ({
          bashAccess: describeBashAccess(options.executor, cwd, resolvedTimeoutMs),
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
          yield* options.executor.run(["/bin/bash", "-c", input.command], {
            cwd,
            timeoutMs: resolvedTimeoutMs,
            signal: toolOptions.abortSignal,
          });
        },
      });

      return { bash: safeBash, describeBashEnv };
    },
  };
}
