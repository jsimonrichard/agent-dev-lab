import { describe, expect, it } from "bun:test";

import { isLoopbackHostHeader } from "./loopback-host";

describe("isLoopbackHostHeader", () => {
  it("accepts loopback names with or without a port", () => {
    expect(isLoopbackHostHeader("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHostHeader("localhost:3000")).toBe(true);
    expect(isLoopbackHostHeader("localhost")).toBe(true);
    expect(isLoopbackHostHeader("[::1]:3000")).toBe(true);
  });

  it("rejects other names, missing headers, and malformed values", () => {
    expect(isLoopbackHostHeader("attacker.example:3000")).toBe(false);
    expect(isLoopbackHostHeader("127.0.0.1.attacker.example")).toBe(false);
    expect(isLoopbackHostHeader("192.168.1.20:3000")).toBe(false);
    expect(isLoopbackHostHeader(null)).toBe(false);
    expect(isLoopbackHostHeader("")).toBe(false);
    expect(isLoopbackHostHeader("local host")).toBe(false);
  });
});
