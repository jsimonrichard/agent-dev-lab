import { describe, expect, it } from "bun:test";

import { findRunningForestRunId } from "./retry-forest-guard";

describe("findRunningForestRunId", () => {
  it("returns the root id when the root is still running", () => {
    expect(
      findRunningForestRunId({ workflowRunId: "root", status: "running" }, [
        { workflowRunId: "child", status: "ok" },
      ]),
    ).toBe("root");
  });

  it("returns a descendant id when only a nested run is live", () => {
    expect(
      findRunningForestRunId({ workflowRunId: "root", status: "ok" }, [
        { workflowRunId: "a", status: "ok" },
        { workflowRunId: "b", status: "running" },
      ]),
    ).toBe("b");
  });

  it("returns null when the forest has settled", () => {
    expect(
      findRunningForestRunId({ workflowRunId: "root", status: "error" }, [
        { workflowRunId: "child", status: "cancelled" },
      ]),
    ).toBeNull();
  });
});
