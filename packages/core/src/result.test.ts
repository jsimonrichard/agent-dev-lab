import { describe, expect, it } from "bun:test";

import { err, fromThrowable, ok, unwrap, unwrapErr } from "./result";

describe("Result", () => {
  it("wraps success and failure", () => {
    expect(ok("hi")).toEqual({ value: "hi", isErr: false, isOk: true });
    expect(err("nope")).toEqual({ error: "nope", isErr: true, isOk: false });
    expect(ok()).toEqual({ value: undefined, isErr: false, isOk: true });
  });

  it("narrows with isOk / isErr properties", () => {
    const success = ok(1);
    const failure = err("missing");
    expect(success.isOk && success.value).toBe(1);
    expect(failure.isErr && failure.error).toBe("missing");
  });

  it("unwrap and unwrapErr", () => {
    expect(unwrap(ok("hi"))).toBe("hi");
    expect(unwrapErr(err("nope"))).toBe("nope");
    expect(() => unwrap(err("nope"))).toThrow(/Result is Err/);
    expect(() => unwrapErr(ok("hi"))).toThrow(/Result is Ok/);
  });

  it("fromThrowable captures Error messages", () => {
    expect(fromThrowable(() => "ok")).toEqual(ok("ok"));
    expect(
      fromThrowable(() => {
        throw new Error("missing demo data");
      }),
    ).toEqual(err("missing demo data"));
    expect(
      fromThrowable(() => {
        throw "bare";
      }),
    ).toEqual(err("bare"));
  });
});
