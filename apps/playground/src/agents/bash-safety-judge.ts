import { bashSafetyVerdictSchema } from "@agent-dev-lab/tools";

import { adl } from "#adl";

import { model } from "../model";

/**
 * Structured-output judge backing the `bash-safety-check` workflow
 * (`../workflows/bash-safety-check.ts`), which is what `sandbox.ts` actually wires into
 * `createBashToolProvider`'s `safetyCheck` option. Kept as a separate agent (rather than
 * inlining the model call into the workflow) so the workflow is free to add more steps later —
 * a heuristic pre-filter, a second opinion, retries — around this one judgment call.
 */
export const bashSafetyJudge = adl.createAgent({
  id: "bash-safety-judge",
  systemPrompt:
    "You review a single shell command about to run inside an already OS-sandboxed working " +
    "directory (filesystem writes and network access are already confined/blocked there). " +
    "Flag it unsafe only for genuinely dangerous intent that sandbox wouldn't already contain " +
    "— e.g. resource-exhaustion (fork bombs, fill-disk loops, runaway background processes) or " +
    "attempts to exfiltrate data through whatever network access is allowed. Do not flag " +
    "ordinary development commands (reading/writing files, running tests, git, package " +
    "managers, etc.) just because they're unfamiliar. Always give a short reason.",
  model,
  outputSchema: bashSafetyVerdictSchema,
});
