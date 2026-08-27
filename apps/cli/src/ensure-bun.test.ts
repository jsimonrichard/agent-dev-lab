import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "bun:test";

import { bunRelaunchArgs, isBunRuntime } from "./ensure-bun";

describe("ensure-bun", () => {
  it("detects the Bun runtime from process.versions", () => {
    expect(isBunRuntime({ bun: "1.4.0" } as NodeJS.ProcessVersions)).toBe(true);
    expect(isBunRuntime({} as NodeJS.ProcessVersions)).toBe(false);
  });

  it("relaunches the current CLI file under bun --bun", () => {
    const execUrl = pathToFileURL(path.join("/tmp", "cli.js")).href;
    expect(bunRelaunchArgs(execUrl, ["node", "/tmp/cli.js", "dashboard"])).toEqual([
      "--bun",
      path.join("/tmp", "cli.js"),
      "dashboard",
    ]);
  });
});
