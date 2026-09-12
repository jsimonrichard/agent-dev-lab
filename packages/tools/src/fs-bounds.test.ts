import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  checkPathAccess,
  isWithinRoot,
  realpathOrResolve,
  realpathPathBound,
  resolveAllowReadList,
  resolveAllowWriteList,
  resolveDenyList,
} from "./fs-bounds.ts";
import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";

describe("resolveAllowWriteList", () => {
  it("defaults omitted to [anchor]", () => {
    expect(resolveAllowWriteList({ anchor: "/proj", allowWrite: undefined })).toEqual(["/proj"]);
  });

  it("keeps an empty list as deny-all writes", () => {
    expect(resolveAllowWriteList({ anchor: "/proj", allowWrite: [] })).toEqual([]);
  });

  it("resolves and dedupes an explicit list", () => {
    expect(
      resolveAllowWriteList({
        anchor: "/proj",
        allowWrite: ["/proj/b", "/proj/a", "/proj/a"],
      }),
    ).toEqual(["/proj/b", "/proj/a"]);
  });
});

describe("resolveAllowReadList", () => {
  it("defaults omitted to [anchor]", () => {
    expect(resolveAllowReadList({ anchor: "/cwd", allowRead: undefined })).toEqual(["/cwd"]);
  });

  it("keeps [] as deny-all", () => {
    expect(resolveAllowReadList({ anchor: "/cwd", allowRead: [] })).toEqual([]);
  });

  it("treats null as deny-all", () => {
    expect(resolveAllowReadList({ anchor: "/cwd", allowRead: null })).toEqual([]);
  });

  it("treats UNBOUNDED_ALLOW_READ (**) as unbounded", () => {
    expect(
      resolveAllowReadList({
        anchor: "/cwd",
        allowRead: UNBOUNDED_ALLOW_READ,
      }),
    ).toBe(UNBOUNDED_ALLOW_READ);
  });

  it("does not union an explicit list with anything else", () => {
    expect(
      resolveAllowReadList({
        anchor: "/cwd",
        allowRead: ["/only"],
      }),
    ).toEqual(["/only"]);
  });
});

describe("resolveDenyList", () => {
  it("defaults omitted and null to []", () => {
    expect(resolveDenyList(undefined)).toEqual([]);
    expect(resolveDenyList(null)).toEqual([]);
  });

  it("resolves and dedupes", () => {
    expect(resolveDenyList(["/a", "/b", "/a"])).toEqual(["/a", "/b"]);
  });
});

describe("isWithinRoot", () => {
  it("accepts the root itself and descendants", () => {
    expect(isWithinRoot("/sandbox", "/sandbox")).toBe(true);
    expect(isWithinRoot("/sandbox/a.txt", "/sandbox")).toBe(true);
  });

  it("rejects paths outside the root", () => {
    expect(isWithinRoot("/other", "/sandbox")).toBe(false);
    expect(isWithinRoot("/sandbox-other", "/sandbox")).toBe(false);
  });
});

describe("checkPathAccess", () => {
  it("allows a path under an allow root", () => {
    expect(checkPathAccess("/sandbox/a.txt", { allow: ["/sandbox"], deny: [] })).toBeUndefined();
  });

  it("denies before allow — deny wins even under allow", () => {
    expect(
      checkPathAccess("/sandbox/secret/x", {
        allow: ["/sandbox"],
        deny: ["/sandbox/secret"],
      }),
    ).toEqual({ kind: "denied", denyRoot: "/sandbox/secret" });
  });

  it("denies under unbounded allow when deny matches", () => {
    expect(
      checkPathAccess("/etc/passwd", {
        allow: UNBOUNDED_ALLOW_READ,
        deny: ["/etc"],
      }),
    ).toEqual({ kind: "denied", denyRoot: "/etc" });
  });

  it("allows anything under unbounded when deny misses", () => {
    expect(
      checkPathAccess("/etc/passwd", {
        allow: UNBOUNDED_ALLOW_READ,
        deny: ["/var"],
      }),
    ).toBeUndefined();
  });

  it("rejects when allow is empty", () => {
    expect(checkPathAccess("/sandbox/a", { allow: [], deny: [] })).toEqual({
      kind: "outside-allow",
    });
  });

  it("rejects outside all allow roots", () => {
    expect(checkPathAccess("/other/a", { allow: ["/sandbox"], deny: [] })).toEqual({
      kind: "outside-allow",
    });
  });

  it("allows under any of multiple allow roots", () => {
    expect(checkPathAccess("/b/x", { allow: ["/a", "/b"], deny: [] })).toBeUndefined();
  });
});

describe("realpathOrResolve", () => {
  it("returns realpath for an existing path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-fs-bounds-"));
    const file = path.join(root, "f.txt");
    await writeFile(file, "x");
    const link = path.join(root, "link.txt");
    await symlink(file, link);
    expect(await realpathOrResolve(link)).toBe(await realpathOrResolve(file));
  });

  it("falls back to path.resolve on ENOENT", async () => {
    const missing = path.join(tmpdir(), "adl-fs-bounds-missing", "nope");
    expect(await realpathOrResolve(missing)).toBe(path.resolve(missing));
  });
});

describe("realpathPathBound", () => {
  it("realpaths allow and deny lists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adl-fs-bounds-"));
    const allowDir = path.join(root, "allow");
    const denyDir = path.join(root, "deny");
    await mkdir(allowDir);
    await mkdir(denyDir);
    const bound = await realpathPathBound({
      allow: [allowDir],
      deny: [denyDir],
    });
    expect(bound.allow).toEqual([await realpathOrResolve(allowDir)]);
    expect(bound.deny).toEqual([await realpathOrResolve(denyDir)]);
  });

  it("leaves UNBOUNDED_ALLOW_READ intact", async () => {
    const bound = await realpathPathBound({
      allow: UNBOUNDED_ALLOW_READ,
      deny: [],
    });
    expect(bound.allow).toBe(UNBOUNDED_ALLOW_READ);
  });
});
