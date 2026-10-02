import { describe, expect, it } from "bun:test";

import { isSemverPrerelease, resolveNpmDistTag, semverPreid } from "./npm-dist-tag.ts";

describe("isSemverPrerelease", () => {
  it("detects hyphen prereleases and ignores build metadata alone", () => {
    expect(isSemverPrerelease("0.0.7-rc.1")).toBe(true);
    expect(isSemverPrerelease("1.0.0-beta")).toBe(true);
    expect(isSemverPrerelease("1.0.0+build.1")).toBe(false);
    expect(isSemverPrerelease("0.0.6")).toBe(false);
  });
});

describe("semverPreid", () => {
  it("returns the first prerelease identifier", () => {
    expect(semverPreid("0.0.7-rc.1")).toBe("rc");
    expect(semverPreid("1.2.3-canary.9")).toBe("canary");
    expect(semverPreid("1.0.0-beta")).toBe("beta");
    expect(semverPreid("1.0.0-rc.1+meta")).toBe("rc");
    expect(semverPreid("0.0.6")).toBeUndefined();
  });
});

describe("resolveNpmDistTag", () => {
  it("omits the tag for stable versions", () => {
    expect(resolveNpmDistTag("0.0.6", undefined)).toBeUndefined();
    expect(resolveNpmDistTag("1.0.0+build.1", undefined)).toBeUndefined();
  });

  it("infers the preid as the dist-tag for prereleases", () => {
    expect(resolveNpmDistTag("0.0.7-rc.0", undefined)).toBe("rc");
    expect(resolveNpmDistTag("1.0.0-canary.2", undefined)).toBe("canary");
  });

  it("honors NPM_DIST_TAG override when safe", () => {
    expect(resolveNpmDistTag("0.0.7-rc.1", "rc")).toBe("rc");
    expect(resolveNpmDistTag("0.0.6", "next")).toBe("next");
    expect(resolveNpmDistTag("0.0.6", " latest ")).toBe("latest");
  });

  it("refuses prerelease + latest (override or preid)", () => {
    expect(() => resolveNpmDistTag("0.0.7-rc.1", "latest")).toThrow(/latest/);
    expect(() => resolveNpmDistTag("1.0.0-latest.1", undefined)).toThrow(/latest/);
  });

  it("throws when version is empty", () => {
    expect(() => resolveNpmDistTag("", undefined)).toThrow(/required/);
  });
});
