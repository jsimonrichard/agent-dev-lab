import { adl } from "#adl";

import { model } from "../model";
import { sandboxRoot, sandboxWorkspaceNative } from "../tools/sandbox";

/**
 * Same demo as `sandbox-agent`, but with the `bash` tool backed by the direct-`bwrap`
 * executor (`createNativeBashExecutor`, Linux only) instead of ASRT, and no safety check
 * wired in — no `socat`/`ripgrep` dependency, but network access (if ever enabled) would be
 * all-or-nothing and there's no violation logging. Kept as a separate agent so both executors
 * (and both with/without a safety check) can be smoke-tested from the same registry. See
 * `notes/tool-sandboxing.md`.
 */
export const sandboxAgentNative = adl.createAgent({
  id: "sandbox-agent-native",
  systemPrompt:
    "You are a sandboxed coding assistant. You can read, write, and edit files, run " +
    `shell commands confined to your working directory (default ${sandboxRoot}), ` +
    "and fetch public http(s) URLs. Bash has no network; nothing outside the working " +
    "directory is visible to the file or bash tools. Call describeWorkspaceEnv " +
    "if you're ever unsure what's allowed. Use the tools to complete the user's task, then " +
    "give a concise summary of what you did and what you found.",
  model,
  tools: sandboxWorkspaceNative,
});
