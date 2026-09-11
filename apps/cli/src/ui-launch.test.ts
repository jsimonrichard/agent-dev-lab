import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";

import {
  adlProjectWatchEnvValue,
  resolveUiLaunchMode,
  shouldForwardUiChildSignals,
} from "./ui-launch";

const webRoot = path.resolve(fileURLToPath(new URL("../../web", import.meta.url)));

describe("resolveUiLaunchMode", () => {
  it("uses vite in the monorepo web tree", () => {
    expect(
      resolveUiLaunchMode({
        prebuilt: false,
        frameworkDev: false,
        webRoot,
      }),
    ).toBe("project-dev");
  });

  it("uses Nitro when the web package has no Vite tree, or when --prebuilt is set", () => {
    expect(
      resolveUiLaunchMode({
        prebuilt: false,
        frameworkDev: false,
        webRoot: "/tmp/not-a-web-package",
      }),
    ).toBe("serve");
    expect(resolveUiLaunchMode({ prebuilt: true, frameworkDev: false, webRoot })).toBe("serve");
  });
});

describe("adlProjectWatchEnvValue", () => {
  it("disables watch only when the user passed --serve", () => {
    expect(adlProjectWatchEnvValue({ serve: true })).toBe("0");
    expect(adlProjectWatchEnvValue({ serve: false })).toBe("1");
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
