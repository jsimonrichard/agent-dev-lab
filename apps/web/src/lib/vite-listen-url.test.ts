import { describe, expect, it } from "bun:test";

import { viteListenLoopbackUrl } from "./vite-listen-url";

describe("viteListenLoopbackUrl", () => {
  it("keeps an IPv4 loopback bind", () => {
    expect(
      viteListenLoopbackUrl({ address: "127.0.0.1", family: "IPv4", port: 3000 }, "/api/project"),
    ).toBe("http://127.0.0.1:3000/api/project");
  });

  it("rewrites 0.0.0.0 to 127.0.0.1", () => {
    expect(
      viteListenLoopbackUrl({ address: "0.0.0.0", family: "IPv4", port: 3001 }, "/api/project"),
    ).toBe("http://127.0.0.1:3001/api/project");
  });

  it("fetches ::1 instead of 127.0.0.1 when Vite bound IPv6 localhost", () => {
    expect(
      viteListenLoopbackUrl({ address: "::1", family: "IPv6", port: 3001 }, "/api/project"),
    ).toBe("http://[::1]:3001/api/project");
  });

  it("rewrites IPv6 any-address to [::1]", () => {
    expect(viteListenLoopbackUrl({ address: "::", family: "IPv6", port: 4321 }, "/x")).toBe(
      "http://[::1]:4321/x",
    );
  });
});
