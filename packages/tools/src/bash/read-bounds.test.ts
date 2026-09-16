import { lstatSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import {
  expandedRootDenyReadPaths,
  existingSystemReadPaths,
  systemReadBwrapArgs,
} from "./read-bounds.ts";

describe("existingSystemReadPaths", () => {
  it("omits usr-merge symlinks such as /bin", () => {
    const paths = existingSystemReadPaths();
    for (const p of paths) {
      expect(lstatSync(p).isSymbolicLink()).toBe(false);
      expect(lstatSync(p).isDirectory()).toBe(true);
    }
    if (lstatSync("/bin").isSymbolicLink()) {
      expect(paths).not.toContain("/bin");
      expect(paths).toContain("/usr");
    }
  });
});

describe("expandedRootDenyReadPaths", () => {
  it("lists real root directories and skips symlink mounts and proc/dev/sys", () => {
    const paths = expandedRootDenyReadPaths();
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/proc");
    expect(paths).not.toContain("/dev");
    expect(paths).not.toContain("/sys");
    for (const p of paths) {
      expect(p.startsWith("/")).toBe(true);
      expect(p.split("/").length).toBe(2);
      expect(lstatSync(p).isSymbolicLink()).toBe(false);
      expect(lstatSync(p).isDirectory()).toBe(true);
    }
    if (lstatSync("/bin").isSymbolicLink()) {
      expect(paths).not.toContain("/bin");
      expect(paths).not.toContain("/sbin");
      expect(paths).toContain("/usr");
      expect(paths).toContain("/tmp");
    }
  });
});

describe("systemReadBwrapArgs", () => {
  it("uses --symlink for usr-merge links and --ro-bind for real dirs", () => {
    const args = systemReadBwrapArgs();
    if (lstatSync("/bin").isSymbolicLink()) {
      let sawBinSymlink = false;
      for (let i = 0; i < args.length - 2; i += 1) {
        if (args[i] === "--symlink" && args[i + 2] === "/bin") {
          expect(args[i + 1]).toBe("usr/bin");
          sawBinSymlink = true;
        }
      }
      expect(sawBinSymlink).toBe(true);
    }
    let sawUsrBind = false;
    for (let i = 0; i < args.length - 2; i += 1) {
      if (args[i] === "--ro-bind" && args[i + 1] === "/usr" && args[i + 2] === "/usr") {
        sawUsrBind = true;
      }
    }
    expect(sawUsrBind).toBe(true);
  });
});
