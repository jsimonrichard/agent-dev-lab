import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { DEFAULT_SANDBOX_RELATIVE_PATH, resolveDefaultSandboxRoot } from "./paths";

const originalEnv = process.env.ADL_SANDBOX_ROOT;

beforeEach(() => {
  delete process.env.ADL_SANDBOX_ROOT;
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.ADL_SANDBOX_ROOT;
  } else {
    process.env.ADL_SANDBOX_ROOT = originalEnv;
  }
});

describe("resolveDefaultSandboxRoot", () => {
  it("resolves the default relative path against the given projectRoot", () => {
    expect(resolveDefaultSandboxRoot("/my/project")).toBe(
      path.resolve("/my/project", DEFAULT_SANDBOX_RELATIVE_PATH),
    );
  });

  it("resolves against process.cwd() when projectRoot is omitted", () => {
    expect(resolveDefaultSandboxRoot()).toBe(
      path.resolve(process.cwd(), DEFAULT_SANDBOX_RELATIVE_PATH),
    );
  });

  it("uses an absolute ADL_SANDBOX_ROOT as-is, ignoring projectRoot", () => {
    process.env.ADL_SANDBOX_ROOT = "/custom/sandbox";
    expect(resolveDefaultSandboxRoot("/my/project")).toBe("/custom/sandbox");
  });

  it("resolves a relative ADL_SANDBOX_ROOT against projectRoot", () => {
    process.env.ADL_SANDBOX_ROOT = "custom/sandbox";
    expect(resolveDefaultSandboxRoot("/my/project")).toBe(
      path.resolve("/my/project", "custom/sandbox"),
    );
  });

  it("has no filesystem side effects — the directory is never created", async () => {
    const { existsSync } = await import("node:fs");
    const resolved = resolveDefaultSandboxRoot("/definitely/does/not/exist/anywhere");
    expect(existsSync(resolved)).toBe(false);
  });
});
