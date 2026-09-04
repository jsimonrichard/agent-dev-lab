import { adl } from "#adl";

import { model } from "../model";
import { sandboxRoot, sandboxWorkspaceAsrt } from "../tools/sandbox";

/**
 * Demonstrates `@agent-dev-lab/tools`' `createWorkspaceToolProvider` end-to-end, with the
 * `bash` tool backed by the ASRT executor (`createAsrtBashExecutor` — the preferred default per
 * `notes/tool-sandboxing.md`) and an AI-based safety check (`bash-safety-check` workflow)
 * layered on top. `tools` is a `ToolProvider`, not a fixed `ToolSet` — so `sandbox-demo` can
 * point this agent at a different working directory per run via `toolProviderContext.cwd`,
 * instead of it being fixed here at agent-construction time.
 */
export const sandboxAgent = adl.createAgent({
  id: "sandbox-agent",
  systemPrompt:
    "You are a sandboxed coding assistant. You can read, write, and edit files, and run " +
    `shell commands, but everything is confined to your working directory (default ${sandboxRoot}) ` +
    "— there is no network access and nothing outside it is visible. Call describeWorkspaceEnv " +
    "if you're ever unsure what's allowed. Use the tools to complete the user's task, then " +
    "give a concise summary of what you did and what you found.",
  model,
  tools: sandboxWorkspaceAsrt,
});
