import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkspaceToolProvider, resolveDefaultSandboxRoot } from "@agent-dev-lab/tools";

import { bashSafetyCheck } from "../workflows/bash-safety-check";

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Shared sandbox root for the `sandbox-agent*` demo agents (`@agent-dev-lab/tools`) — gitignored
 * (`.data/`) and created eagerly since the workspace tool provider's file jail resolves the root
 * lazily on first use and expects it to already exist. `resolveDefaultSandboxRoot` mirrors
 * `@agent-dev-lab/core`'s `resolveAdlSqlitePath` convention (`.data/sandbox`, overridable via
 * `ADL_SANDBOX_ROOT`). See `notes/tool-sandboxing.md`.
 */
export const sandboxRoot = resolveDefaultSandboxRoot(playgroundRoot);
mkdirSync(sandboxRoot, { recursive: true });

/**
 * Workspace tools (file + bash + `fetchUrl`, sharing one `cwd` for file/bash) via the
 * process-scoped ASRT executor pool (default `backend`). Needs `bwrap`, `socat`, and
 * `ripgrep` on `PATH`; throws a clear `AdlError` (surfaced as a failed tool call) if any
 * are missing rather than silently running unsandboxed. Layers the `bash-safety-check`
 * workflow on top as an AI-based check for non-filesystem dangerous intent the sandbox
 * itself can't catch. `LoadedAdlProject` supplies `projectRoot` for pool keying.
 */
export const sandboxWorkspaceAsrt = createWorkspaceToolProvider({
  allowWrite: [sandboxRoot],
  cwd: sandboxRoot,
  safetyCheck: bashSafetyCheck,
});

/**
 * Same workspace tools (file + bash + `fetchUrl`), backed by the pooled native/`bwrap`
 * backend instead (Linux only — throws a clear "not implemented" error elsewhere). No
 * `socat`/`ripgrep` dependency, but network access is all-or-nothing and there's no
 * violation logging, unlike ASRT. No safety check wired in, so both configurations
 * (with and without one) stay exercised.
 */
export const sandboxWorkspaceNative = createWorkspaceToolProvider({
  allowWrite: [sandboxRoot],
  cwd: sandboxRoot,
  backend: "native",
});
