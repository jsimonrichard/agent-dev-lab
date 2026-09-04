import { mkdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { adl } from "#adl";

import { sandboxAgent } from "../agents/sandbox-agent";
import { sandboxAgentNative } from "../agents/sandbox-agent-native";
import { sandboxRoot } from "../tools/sandbox";

const sandboxDemoInput = z.object({
  task: z
    .string()
    .default(
      "Create a file called hello.txt containing a short haiku about sandboxes, then run " +
        "`wc -w hello.txt` to count its words and report the count.",
    ),
  backend: z
    .enum(["asrt", "native"])
    .default("asrt")
    .describe(
      'Which BashExecutor backs the sandbox agent\'s `bash` tool: "asrt" ' +
        '(@anthropic-ai/sandbox-runtime, needs bwrap+socat+ripgrep) or "native" (direct ' +
        "bwrap, Linux only, needs only bwrap).",
    ),
  subdir: z
    .string()
    .optional()
    .describe(
      "Optional subdirectory (under the sandbox root) for this run to work in — created if " +
        "missing. Passed to the agent as toolProviderContext.cwd, demonstrating a workflow " +
        "picking a fresh working directory per run without touching agent construction. " +
        "Omit to use the sandbox root itself.",
    ),
});

/**
 * Exercises `@agent-dev-lab/tools`' sandboxed workspace tools end-to-end: a tool-using agent
 * reads/writes files and runs shell commands, all confined to `.data/sandbox`
 * (`src/tools/sandbox.ts`). `backend` selects which of the two `sandbox-agent*` agents runs —
 * `sandbox-agent` (ASRT executor + an AI-based safety check) or `sandbox-agent-native` (direct
 * `bwrap`, no safety check) — so both implementations from `notes/tool-sandboxing.md` can be
 * smoke-tested from one entry point. `subdir` demonstrates the workflow-controlled `cwd`
 * `createWorkspaceToolProvider` adds: each run can point the same agent at its own working
 * directory via `toolProviderContext`, set here, never by the model.
 *
 * If the selected backend's prerequisites aren't installed, the `bash` tool call fails with a
 * descriptive `AdlError` (naming what's missing and how to install it) rather than silently
 * running unsandboxed — that failure surfaces as this workflow's `step_failed` / thrown error.
 */
export const sandboxDemo = adl.createWorkflow({
  id: "sandbox-demo",
  inputSchema: sandboxDemoInput,
  outputSchema: z.object({
    backend: z.enum(["asrt", "native"]),
    cwd: z.string(),
    summary: z.string(),
    turns: z.number(),
  }),
  async run(input, ctx) {
    const { task, backend, subdir } = sandboxDemoInput.parse(input);
    await ctx.setTitle(`Sandbox demo (${backend}): ${task.slice(0, 60)}`);

    const cwd = subdir ? path.join(sandboxRoot, subdir) : sandboxRoot;
    mkdirSync(cwd, { recursive: true });

    const agent = backend === "native" ? sandboxAgentNative : sandboxAgent;
    const scope = ctx.memoryScopeWithSuffix(backend);

    const turn = await ctx.step("run-agent", async ({ ctx: child }) => {
      const result = await agent.run({
        memoryScope: scope,
        user: task,
        toolProviderContext: { cwd },
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      }).result;
      return { text: result.text, turns: result.turns };
    });

    ctx.emit("sandbox-demo-finished", { backend, cwd, turns: turn.turns });

    return {
      backend,
      cwd,
      summary: turn.text || "(no final summary produced within the turn limit)",
      turns: turn.turns,
    };
  },
});
