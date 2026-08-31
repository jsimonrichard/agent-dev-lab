import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";

import { resolveUiLaunchMode, shouldForwardUiChildSignals } from "./ui-launch";

const webRoot = path.resolve(fileURLToPath(new URL("../../web", import.meta.url)));

describe("resolveUiLaunchMode", () => {
  it("uses vite in the monorepo web tree", () => {
    expect(
      resolveUiLaunchMode({
        serve: false,
        frameworkDev: false,
        webRoot,
      }),
    ).toBe("project-dev");
  });

  it("serves the Nitro build when requested or when src is missing", () => {
    expect(resolveUiLaunchMode({ serve: true, frameworkDev: false })).toBe("serve");
    expect(
      resolveUiLaunchMode({
        serve: false,
        frameworkDev: false,
        webRoot: "/tmp/not-a-web-package",
      }),
    ).toBe("serve");
  });
});

describe("shouldForwardUiChildSignals", () => {
  it("forwards when stdin is not a TTY so kill(pid) can stop --serve", () => {
    expect(shouldForwardUiChildSignals({ isTTY: false })).toBe(true);
    expect(shouldForwardUiChildSignals({})).toBe(true);
    expect(shouldForwardUiChildSignals(undefined)).toBe(true);
  });

  it("does not forward in a TTY where the process group already got Ctrl+C", () => {
    expect(shouldForwardUiChildSignals({ isTTY: true })).toBe(false);
  });
});
