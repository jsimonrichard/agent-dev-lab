import { describe, expect, it } from "bun:test";

import {
  formatAdlProjectReloadLog,
  formatAdlProjectReloadPath,
  shouldColorAdlProjectReloadLog,
} from "./adl-project-reload-log";

const noon = new Date("2026-09-11T12:00:00");

describe("formatAdlProjectReloadPath", () => {
  it("returns a path relative to the project root", () => {
    expect(formatAdlProjectReloadPath("/tmp/proj", "/tmp/proj/src/workflows/demo.ts")).toBe(
      "src/workflows/demo.ts",
    );
  });

  it("keeps a path that is outside the project root", () => {
    expect(formatAdlProjectReloadPath("/tmp/proj", "/elsewhere/x.ts")).toBe("/elsewhere/x.ts");
  });
});

describe("formatAdlProjectReloadLog", () => {
  it("matches Vite's time + tag + action + file shape", () => {
    const line = formatAdlProjectReloadLog(
      {
        type: "reload",
        root: "/tmp/proj",
        path: "/tmp/proj/src/workflows/demo.ts",
        now: noon,
      },
      { color: false },
    );
    expect(line).toBe(`${noon.toLocaleTimeString()} [adl] reload src/workflows/demo.ts`);
  });

  it("omits the file when the watcher did not report a path", () => {
    const line = formatAdlProjectReloadLog(
      { type: "reload", root: "/tmp/proj", now: noon },
      { color: false },
    );
    expect(line).toBe(`${noon.toLocaleTimeString()} [adl] reload`);
  });

  it("prints a failed reload on one line", () => {
    const line = formatAdlProjectReloadLog(
      { type: "error", message: "Unexpected token", now: noon },
      { color: false },
    );
    expect(line).toBe(`${noon.toLocaleTimeString()} [adl] reload failed Unexpected token`);
  });

  it("wraps the action in ANSI when color is requested", () => {
    const line = formatAdlProjectReloadLog(
      { type: "reload", root: "/tmp/proj", path: "/tmp/proj/a.ts", now: noon },
      { color: true },
    );
    expect(line).toContain("\u001b[32mreload\u001b[0m");
    expect(line).toContain("\u001b[36m[adl]\u001b[0m");
  });
});

describe("shouldColorAdlProjectReloadLog", () => {
  it("opts out when NO_COLOR is set", () => {
    expect(shouldColorAdlProjectReloadLog({ NO_COLOR: "1" }, { isTTY: true })).toBe(false);
  });

  it("forces color when FORCE_COLOR is set", () => {
    expect(shouldColorAdlProjectReloadLog({ FORCE_COLOR: "1" }, { isTTY: false })).toBe(true);
  });

  it("follows the stream TTY otherwise", () => {
    expect(shouldColorAdlProjectReloadLog({}, { isTTY: true })).toBe(true);
    expect(shouldColorAdlProjectReloadLog({}, { isTTY: false })).toBe(false);
  });
});
