import { randomUUID } from "node:crypto";

import { bashSafetyCheckInputSchema, bashSafetyVerdictSchema } from "@agent-dev-lab/tools";

import { adl } from "#adl";

import { bashSafetyJudge } from "../agents/bash-safety-judge";

/**
 * Wired into `sandbox-agent`'s workspace tool provider (`../tools/sandbox.ts`) as its
 * `BashSafetyCheckWorkflow` — see `@agent-dev-lab/tools`' `createBashToolProvider` and
 * `notes/tool-sandboxing.md`. A `Workflow`, not a bare `Agent`, precisely so more can be added
 * around the one judge call below later (a heuristic pre-filter, a retry, a second opinion)
 * without changing the interface `createBashToolProvider` expects.
 *
 * Deliberately **not** added to `adl.config.ts`'s `workflows` array — it's a reusable internal
 * helper, not something a user starts directly, same convention as `conversationTitle` (a
 * `titleWorkflow` helper also left unlisted).
 */
export const bashSafetyCheck = adl.createWorkflow({
  id: "bash-safety-check",
  inputSchema: bashSafetyCheckInputSchema,
  outputSchema: bashSafetyVerdictSchema,
  async run({ command, cwd }, ctx) {
    return ctx.step("judge", async ({ ctx: child }) => {
      const handle = bashSafetyJudge.run({
        memoryScope: randomUUID(),
        user: `Working directory: ${cwd}\nCommand: ${command}`,
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      });
      return (await handle.result).output;
    });
  },
});
