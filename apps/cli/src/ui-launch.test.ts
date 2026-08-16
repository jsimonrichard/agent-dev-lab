import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";

import { resolveUiLaunchMode } from "./ui-launch";

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
