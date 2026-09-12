import { describe, expect, it } from "bun:test";

import { isAdlError } from "@agent-dev-lab/core";

import { UNBOUNDED_ALLOW_READ } from "./unbounded-allow-read.ts";
import { resolveAllowReadList, resolveAllowWriteList } from "./fs-bounds.ts";

describe("resolveAllowWriteList", () => {
  it("defaults omitted to [anchor] when whenOmitted is anchor", () => {
    expect(
      resolveAllowWriteList({ anchor: "/proj", allowWrite: undefined, whenOmitted: "anchor" }),
    ).toEqual(["/proj"]);
  });

  it("returns undefined when omitted and whenOmitted is omit", () => {
    expect(
      resolveAllowWriteList({ anchor: "/proj", allowWrite: undefined, whenOmitted: "omit" }),
    ).toBeUndefined();
  });

  it("throws when omitted and whenOmitted is required", () => {
    try {
      resolveAllowWriteList({ anchor: "/proj", allowWrite: undefined, whenOmitted: "required" });
      throw new Error("expected throw");
    } catch (error) {
      expect(isAdlError(error)).toBe(true);
    }
  });

  it("keeps an empty list as deny-all writes", () => {
    expect(
      resolveAllowWriteList({ anchor: "/proj", allowWrite: [], whenOmitted: "anchor" }),
    ).toEqual([]);
  });

  it("resolves and dedupes an explicit list", () => {
    expect(
      resolveAllowWriteList({
        anchor: "/proj",
        allowWrite: ["/proj/b", "/proj/a", "/proj/a"],
        whenOmitted: "anchor",
      }),
    ).toEqual(["/proj/b", "/proj/a"]);
  });
});

describe("resolveAllowReadList", () => {
  it("defaults omitted to [anchor]", () => {
    expect(
      resolveAllowReadList({ anchor: "/cwd", allowRead: undefined, nullMeans: "unbounded" }),
    ).toEqual(["/cwd"]);
  });

  it("keeps [] as deny-all", () => {
    expect(resolveAllowReadList({ anchor: "/cwd", allowRead: [], nullMeans: "unbounded" })).toEqual(
      [],
    );
  });

  it("treats UNBOUNDED_ALLOW_READ as unbounded", () => {
    expect(
      resolveAllowReadList({
        anchor: "/cwd",
        allowRead: UNBOUNDED_ALLOW_READ,
        nullMeans: "deny-all",
      }),
    ).toBeNull();
  });

  it("treats null as unbounded when nullMeans is unbounded", () => {
    expect(
      resolveAllowReadList({ anchor: "/cwd", allowRead: null, nullMeans: "unbounded" }),
    ).toBeNull();
  });

  it("treats null as deny-all when nullMeans is deny-all", () => {
    expect(
      resolveAllowReadList({ anchor: "/cwd", allowRead: null, nullMeans: "deny-all" }),
    ).toEqual([]);
  });

  it("does not union an explicit list with anything else", () => {
    expect(
      resolveAllowReadList({
        anchor: "/cwd",
        allowRead: ["/only"],
        nullMeans: "unbounded",
      }),
    ).toEqual(["/only"]);
  });
});
