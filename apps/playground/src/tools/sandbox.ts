import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAsrtBashExecutor,
  createNativeBashExecutor,
  createWorkspaceToolProvider,
  resolveDefaultSandboxRoot,
} from "@agent-dev-lab/tools";

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
 * Workspace tools (file + bash, sharing one `cwd`) backed by the ASRT executor — the preferred
 * default per `notes/tool-sandboxing.md`. Needs `bwrap`, `socat`, and `ripgrep` on `PATH`;
 * throws a clear `AdlError` (surfaced as a failed tool call) if any are missing rather than
 * silently running unsandboxed. Layers the `bash-safety-check` workflow on top as an
 * AI-based check for non-filesystem dangerous intent the sandbox itself can't catch.
 */
export const sandboxWorkspaceAsrt = createWorkspaceToolProvider({
  executor: createAsrtBashExecutor({ allowWrite: [sandboxRoot] }),
  cwd: sandboxRoot,
  safetyCheck: bashSafetyCheck,
});

/**
 * Same workspace tools, backed by the direct-`bwrap` executor instead (Linux only — throws a
 * clear "not implemented" error elsewhere). No `socat`/`ripgrep` dependency, but network access
 * is all-or-nothing and there's no violation logging, unlike the ASRT executor above. No
 * safety check wired in, so both configurations (with and without one) stay exercised.
 */
export const sandboxWorkspaceNative = createWorkspaceToolProvider({
  executor: createNativeBashExecutor({ allowWrite: [sandboxRoot] }),
  cwd: sandboxRoot,
});
