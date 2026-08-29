import { describe, expect, it } from "bun:test";

import { inspectorModeFromPath } from "./inspector-mode";

describe("inspectorModeFromPath", () => {
  it("classifies /events before the workflows fallback", () => {
    expect(inspectorModeFromPath("/events")).toBe("events");
    expect(inspectorModeFromPath("/events/")).toBe("events");
    expect(inspectorModeFromPath("/workflows")).toBe("workflows");
    expect(inspectorModeFromPath("/")).toBe("home");
  });
});
