import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { createAsrtBashExecutor } from "./asrt/executor.ts";
import { canonicalizeAllowEnv, type AllowEnv, type CanonicalAllowEnv } from "./allow-env.ts";
import type { BashExecutor } from "./executor.ts";
import { createNativeBashExecutor } from "./native-executor.ts";
import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";

export type BashSandboxBackend = "asrt" | "native";

/** Default `allowedDomains` while `allowNetwork` is off — applied only when network is enabled. */
export const DEFAULT_ALLOWED_DOMAINS: string[] = ["*"];

export const ALLOWED_DOMAINS_DESCRIPTION =
  'These are the hosts that may be reached through fetchUrl or the bash tool. Only matters when allowNetwork is true. "*" allows any host.';

/** Isolation policy fields — not `cwd` / timeouts / output caps. */
export interface BashSandboxPolicy {
  allowWrite: string[];
  /**
   * Paths reads are confined to. After provider merge: a list, {@link UNBOUNDED_ALLOW_READ}
   * for host-wide, or `null`/`[]` for nothing readable. On options/context before merge,
   * omit to default to `[cwd]`.
   */
  allowRead?: string[] | null | typeof UNBOUNDED_ALLOW_READ;
  denyRead?: string[];
  denyWrite?: string[];
  allowedDomains?: string[];
  deniedDomains?: string[];
  /** Master network switch. Domain lists apply only when this is true. */
  allowNetwork?: boolean;
  /**
   * Host env vars exposed inside the sandbox. Omitted / `[]` → none. Part of the pool key.
   */
  allowEnv?: AllowEnv;
  /**
   * ASRT-only. Directory used as `TMPDIR` inside the sandbox. Omitted → the executor
   * creates a per-instance directory. Native backend rejects this field.
   */
  tmpDir?: string;
}

export interface CanonicalBashSandboxPolicy {
  allowWrite: string[];
  allowRead: string[] | typeof UNBOUNDED_ALLOW_READ;
  denyRead: string[];
  denyWrite: string[];
  allowedDomains: string[];
  deniedDomains: string[];
  allowNetwork: boolean;
  allowEnv: CanonicalAllowEnv;
  tmpDir?: string;
}

export interface BashExecutorPoolKey {
  projectRoot: string;
  backend: BashSandboxBackend;
  policy: CanonicalBashSandboxPolicy;
}

type PoolEntry = {
  executor: BashExecutor;
  refCount: number;
};

type PoolMap = Map<string, PoolEntry>;

/**
 * Process-scoped pool. Pinned on `globalThis` via {@link Symbol.for} so a Vite/Bun HMR
 * re-evaluation of this module reuses the live map instead of orphaning supervisors
 * (same idea as the jiti cache in `@agent-dev-lab/core`'s `load-config.ts`).
 */
const POOL_KEY = Symbol.for("@agent-dev-lab/tools:bashExecutorPool");

function pool(): PoolMap {
  const g = globalThis as typeof globalThis & { [POOL_KEY]?: PoolMap };
  if (!g[POOL_KEY]) {
    g[POOL_KEY] = new Map();
  }
  return g[POOL_KEY]!;
}

function sortedUniqueResolved(projectRoot: string, paths: readonly string[]): string[] {
  const resolved = paths.map((p) => path.resolve(projectRoot, p));
  return [...new Set(resolved)].sort();
}

function sortedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Canonicalize a policy for pooling. Paths are resolved against `projectRoot` and sorted so
 * order does not create a second supervisor.
 */
export function canonicalizeBashSandboxPolicy(
  projectRoot: string,
  policy: BashSandboxPolicy,
): CanonicalBashSandboxPolicy {
  const root = path.resolve(projectRoot);
  const allowWrite = sortedUniqueResolved(root, policy.allowWrite);
  let allowRead: string[] | typeof UNBOUNDED_ALLOW_READ;
  if (policy.allowRead === UNBOUNDED_ALLOW_READ) {
    allowRead = UNBOUNDED_ALLOW_READ;
  } else if (policy.allowRead === undefined) {
    // Escape hatch / incomplete policy: no cwd here. Providers fill omitted reads with
    // `[cwd]` in mergePolicy before acquire — this branch is for direct pool/executor use.
    allowRead = allowWrite;
  } else if (policy.allowRead === null) {
    allowRead = [];
  } else {
    allowRead = sortedUniqueResolved(root, policy.allowRead);
  }
  return {
    allowWrite,
    allowRead,
    denyRead: sortedUniqueResolved(root, policy.denyRead ?? []),
    denyWrite: sortedUniqueResolved(root, policy.denyWrite ?? []),
    allowedDomains: sortedUniqueStrings(policy.allowedDomains ?? []),
    deniedDomains: sortedUniqueStrings(policy.deniedDomains ?? []),
    allowNetwork: policy.allowNetwork ?? false,
    allowEnv: canonicalizeAllowEnv(policy.allowEnv),
    tmpDir: policy.tmpDir === undefined ? undefined : path.resolve(root, policy.tmpDir),
  };
}

export function bashExecutorPoolKeyString(key: BashExecutorPoolKey): string {
  return JSON.stringify({
    projectRoot: path.resolve(key.projectRoot),
    backend: key.backend,
    policy: key.policy,
  });
}

function networkDomainLists(policy: CanonicalBashSandboxPolicy): {
  allowedDomains: string[];
  deniedDomains: string[];
} {
  if (!policy.allowNetwork) {
    return { allowedDomains: [], deniedDomains: [] };
  }
  return {
    allowedDomains: policy.allowedDomains,
    deniedDomains: policy.deniedDomains,
  };
}

function nativeHonorsDomainLists(allowedDomains: string[], deniedDomains: string[]): boolean {
  if (deniedDomains.length > 0) {
    return false;
  }
  if (allowedDomains.length === 0) {
    return true;
  }
  return JSON.stringify(allowedDomains) === JSON.stringify(DEFAULT_ALLOWED_DOMAINS);
}

function createPooledExecutor(
  backend: BashSandboxBackend,
  policy: CanonicalBashSandboxPolicy,
): BashExecutor {
  const { allowedDomains, deniedDomains } = networkDomainLists(policy);
  if (backend === "asrt") {
    if (policy.allowNetwork && allowedDomains.length === 0) {
      throw new AdlError(
        "INVALID_INPUT",
        'ASRT sandbox: allowNetwork is true but allowedDomains is empty — pass at least one host, or "*".',
      );
    }
    return createAsrtBashExecutor({
      allowWrite: policy.allowWrite,
      allowRead: policy.allowRead,
      denyRead: policy.denyRead,
      denyWrite: policy.denyWrite,
      allowedDomains,
      deniedDomains,
      allowEnv: restoreAllowEnv(policy.allowEnv),
      tmpDir: policy.tmpDir,
    });
  }

  if (!nativeHonorsDomainLists(allowedDomains, deniedDomains)) {
    throw new AdlError(
      "INVALID_INPUT",
      'Native bash sandbox does not support per-host allowedDomains/deniedDomains — use backend: "asrt", or "*".',
    );
  }
  if (policy.denyWrite.length > 0) {
    throw new AdlError(
      "INVALID_INPUT",
      'Native bash sandbox does not support denyWrite — use backend: "asrt".',
    );
  }
  if (policy.tmpDir !== undefined) {
    throw new AdlError(
      "INVALID_INPUT",
      'Native bash sandbox does not support tmpDir — ASRT sets TMPDIR; native already mounts a fresh /tmp. Use backend: "asrt", or omit tmpDir.',
    );
  }
  return createNativeBashExecutor({
    allowWrite: policy.allowWrite,
    allowRead: policy.allowRead,
    denyRead: policy.denyRead,
    allowNetwork: policy.allowNetwork,
    allowEnv: restoreAllowEnv(policy.allowEnv),
  });
}

function restoreAllowEnv(allowEnv: CanonicalAllowEnv): AllowEnv | undefined {
  if (allowEnv === true) {
    return true;
  }
  if (allowEnv.length === 0) {
    return undefined;
  }
  return allowEnv.map((entry) =>
    entry.kind === "string" ? entry.value : new RegExp(entry.source, entry.flags),
  );
}

export function bashExecutorPoolKeyFor(options: {
  projectRoot: string;
  backend: BashSandboxBackend;
  policy: BashSandboxPolicy;
}): string {
  const projectRoot = path.resolve(options.projectRoot);
  return bashExecutorPoolKeyString({
    projectRoot,
    backend: options.backend,
    policy: canonicalizeBashSandboxPolicy(projectRoot, options.policy),
  });
}

/**
 * Acquire a shared {@link BashExecutor} for `(projectRoot, backend, policy)`.
 * Throws if `projectRoot` is missing — fail closed rather than sharing across unknown roots.
 *
 * Pass `alreadyHeld: true` when the caller already counts this key toward its dispose
 * release — returns the live executor without bumping the refcount.
 */
export function acquireBashExecutor(options: {
  projectRoot: string | undefined;
  backend: BashSandboxBackend;
  policy: BashSandboxPolicy;
  alreadyHeld?: boolean;
}): { executor: BashExecutor; key: string } {
  if (!options.projectRoot) {
    throw new AdlError(
      "INVALID_INPUT",
      "Pooled bash executor requires projectRoot on the tool-provider context " +
        "(LoadedAdlProject attaches it; or pass createAdlRuntime({ projectRoot })).",
    );
  }
  const projectRoot = path.resolve(options.projectRoot);
  const policy = canonicalizeBashSandboxPolicy(projectRoot, options.policy);
  const key = bashExecutorPoolKeyString({
    projectRoot,
    backend: options.backend,
    policy,
  });
  const existing = pool().get(key);
  if (existing) {
    if (!options.alreadyHeld) {
      existing.refCount += 1;
    }
    return { executor: existing.executor, key };
  }
  if (options.alreadyHeld) {
    throw new AdlError(
      "INIT_FAILED",
      "bash executor pool: alreadyHeld was set but no live entry exists for this policy.",
    );
  }
  const executor = createPooledExecutor(options.backend, policy);
  pool().set(key, { executor, refCount: 1 });
  return { executor, key };
}

/**
 * Drop one hold on `key`. When the refcount hits 0, the executor is disposed and removed.
 * Idempotent for unknown keys (no-op).
 */
export async function releaseBashExecutor(key: string): Promise<void> {
  const map = pool();
  const entry = map.get(key);
  if (!entry) {
    return;
  }
  entry.refCount -= 1;
  if (entry.refCount > 0) {
    return;
  }
  map.delete(key);
  await entry.executor.dispose?.();
}

/** Test helper — how many live pool entries exist. */
export function bashExecutorPoolSizeForTests(): number {
  return pool().size;
}

/** Test helper — the pinned pool map identity (survives simulated module rebind). */
export function bashExecutorPoolMapForTests(): Map<string, unknown> {
  return pool();
}

/** Test helper — drain the pool (dispose every entry). */
export async function resetBashExecutorPoolForTests(): Promise<void> {
  const map = pool();
  const entries = [...map.values()];
  map.clear();
  await Promise.all(entries.map((entry) => entry.executor.dispose?.()));
}
