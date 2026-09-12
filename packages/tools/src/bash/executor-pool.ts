import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import { createAsrtBashExecutor } from "./asrt-executor.ts";
import type { BashExecutor } from "./executor.ts";
import { createNativeBashExecutor } from "./native-executor.ts";

export type BashSandboxBackend = "asrt" | "native";

/** Isolation policy fields — not `cwd` / timeouts / output caps. */
export interface BashSandboxPolicy {
  allowWrite: string[];
  allowRead?: string[];
  denyRead?: string[];
  denyWrite?: string[];
  allowedDomains?: string[];
  deniedDomains?: string[];
  /** Native-only. ASRT derives network access from `allowedDomains`. */
  allowNetwork?: boolean;
}

export interface CanonicalBashSandboxPolicy {
  allowWrite: string[];
  allowRead: string[] | null;
  denyRead: string[];
  denyWrite: string[];
  allowedDomains: string[];
  deniedDomains: string[];
  allowNetwork: boolean;
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

const POOL = new Map<string, PoolEntry>();

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
  return {
    allowWrite: sortedUniqueResolved(root, policy.allowWrite),
    allowRead: policy.allowRead === undefined ? null : sortedUniqueResolved(root, policy.allowRead),
    denyRead: sortedUniqueResolved(root, policy.denyRead ?? []),
    denyWrite: sortedUniqueResolved(root, policy.denyWrite ?? []),
    allowedDomains: sortedUniqueStrings(policy.allowedDomains ?? []),
    deniedDomains: sortedUniqueStrings(policy.deniedDomains ?? []),
    allowNetwork: policy.allowNetwork ?? false,
  };
}

export function bashExecutorPoolKeyString(key: BashExecutorPoolKey): string {
  return JSON.stringify({
    projectRoot: path.resolve(key.projectRoot),
    backend: key.backend,
    policy: key.policy,
  });
}

function createPooledExecutor(
  backend: BashSandboxBackend,
  policy: CanonicalBashSandboxPolicy,
): BashExecutor {
  if (backend === "asrt") {
    if (policy.allowNetwork && policy.allowedDomains.length === 0) {
      throw new AdlError(
        "INVALID_INPUT",
        "ASRT sandbox: allowNetwork is not a separate knob — pass allowedDomains to enable network.",
      );
    }
    return createAsrtBashExecutor({
      allowWrite: policy.allowWrite,
      ...(policy.allowRead === null ? {} : { allowRead: policy.allowRead }),
      denyRead: policy.denyRead,
      denyWrite: policy.denyWrite,
      allowedDomains: policy.allowedDomains,
      deniedDomains: policy.deniedDomains,
    });
  }

  if (policy.allowedDomains.length > 0 || policy.deniedDomains.length > 0) {
    throw new AdlError(
      "INVALID_INPUT",
      'Native bash sandbox does not support allowedDomains/deniedDomains — use backend: "asrt", or allowNetwork.',
    );
  }
  if (policy.denyWrite.length > 0) {
    throw new AdlError(
      "INVALID_INPUT",
      'Native bash sandbox does not support denyWrite — use backend: "asrt".',
    );
  }
  return createNativeBashExecutor({
    allowWrite: policy.allowWrite,
    ...(policy.allowRead === null ? {} : { allowRead: policy.allowRead }),
    denyRead: policy.denyRead,
    allowNetwork: policy.allowNetwork,
  });
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
  const existing = POOL.get(key);
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
  POOL.set(key, { executor, refCount: 1 });
  return { executor, key };
}

/**
 * Drop one hold on `key`. When the refcount hits 0, the executor is disposed and removed.
 * Idempotent for unknown keys (no-op).
 */
export async function releaseBashExecutor(key: string): Promise<void> {
  const entry = POOL.get(key);
  if (!entry) {
    return;
  }
  entry.refCount -= 1;
  if (entry.refCount > 0) {
    return;
  }
  POOL.delete(key);
  await entry.executor.dispose?.();
}

/** Test helper — how many live pool entries exist. */
export function bashExecutorPoolSizeForTests(): number {
  return POOL.size;
}

/** Test helper — drain the pool (dispose every entry). */
export async function resetBashExecutorPoolForTests(): Promise<void> {
  const entries = [...POOL.values()];
  POOL.clear();
  await Promise.all(entries.map((entry) => entry.executor.dispose?.()));
}
