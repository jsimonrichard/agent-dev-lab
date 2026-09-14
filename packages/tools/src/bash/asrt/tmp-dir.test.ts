import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "bun:test";

import { assertOwnedDirectory, resolveAsrtTmpDir } from "./tmp-dir.ts";

const scratch = mkdtempSync(path.join(tmpdir(), "adl-asrt-tmp-dir-test-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("assertOwnedDirectory", () => {
  it("accepts a uid-owned 0o700 directory", () => {
    const dir = path.join(scratch, "ok");
    mkdirSync(dir, { mode: 0o700 });
    chmodSync(dir, 0o700);
    assertOwnedDirectory(dir);
  });

  it("rejects a symlink rather than following it", () => {
    const real = path.join(scratch, "real");
    const link = path.join(scratch, "link");
    mkdirSync(real, { mode: 0o700 });
    chmodSync(real, 0o700);
    symlinkSync(real, link);
    expect(() => assertOwnedDirectory(link)).toThrow(/symlink/);
  });

  it("rejects a regular file", () => {
    const file = path.join(scratch, "file");
    writeFileSync(file, "nope");
    expect(() => assertOwnedDirectory(file)).toThrow(/not a directory/);
  });

  it("rejects a group- or world-writable directory", () => {
    const dir = path.join(scratch, "wide");
    mkdirSync(dir, { mode: 0o777 });
    chmodSync(dir, 0o777);
    expect(() => assertOwnedDirectory(dir)).toThrow(/writable/);
  });
});

describe("resolveAsrtTmpDir", () => {
  it("creates a fresh owned directory when omitted", () => {
    const resolved = resolveAsrtTmpDir();
    try {
      expect(resolved.removeOnDispose).toBe(true);
      const st = lstatSync(resolved.path);
      expect(st.isDirectory()).toBe(true);
      expect(st.isSymbolicLink()).toBe(false);
      expect((st.mode & 0o022) === 0).toBe(true);
    } finally {
      rmSync(resolved.path, { recursive: true, force: true });
    }
  });

  it("creates a missing requested path and marks it for dispose", () => {
    const dir = path.join(scratch, "created");
    const resolved = resolveAsrtTmpDir(dir);
    expect(resolved.path).toBe(dir);
    expect(resolved.removeOnDispose).toBe(true);
    expect(lstatSync(dir).isDirectory()).toBe(true);
  });

  it("adopts an existing owned directory without removing it on dispose", () => {
    const dir = path.join(scratch, "existing");
    mkdirSync(dir, { mode: 0o700 });
    chmodSync(dir, 0o700);
    const resolved = resolveAsrtTmpDir(dir);
    expect(resolved.removeOnDispose).toBe(false);
    expect(resolved.path).toBe(dir);
  });
});
