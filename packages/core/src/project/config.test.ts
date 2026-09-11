import { describe, expect, it } from "bun:test";

import { ADL_PROJECT_WATCH_ENV, shouldWatchAdlProject } from "./config";

describe("shouldWatchAdlProject", () => {
  it("opts out only when ADL_PROJECT_WATCH is 0", () => {
    expect(shouldWatchAdlProject({ [ADL_PROJECT_WATCH_ENV]: "0" })).toBe(false);
    expect(shouldWatchAdlProject({ [ADL_PROJECT_WATCH_ENV]: "1" })).toBe(true);
    expect(shouldWatchAdlProject({})).toBe(true);
  });
});
