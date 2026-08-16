import { describe, expect, it } from "bun:test";

import { formatRunTimestamp, workflowRunLabel, workflowRunSubtitle } from "./workflow-location";

describe("workflowRunLabel", () => {
  it("uses the title when set", () => {
    expect(workflowRunLabel({ runId: "run-1", title: "My run" })).toBe("My run");
  });

  it("falls back to the run id", () => {
    expect(workflowRunLabel({ runId: "run-1" })).toBe("run-1");
  });
});

describe("workflowRunSubtitle", () => {
  const startedAt = "2026-08-25T16:32:34.353Z";

  it("is the timestamp when the run has no title or input", () => {
    expect(workflowRunSubtitle({ runId: "run-1", startedAt })).toBe(formatRunTimestamp(startedAt));
  });

  it("prefixes the run id when a title is set", () => {
    expect(workflowRunSubtitle({ runId: "run-1", title: "My run", startedAt })).toBe(
      `run-1 · ${formatRunTimestamp(startedAt)}`,
    );
  });

  it("appends a non-empty input preview", () => {
    expect(
      workflowRunSubtitle({
        runId: "run-1",
        startedAt,
        inputPreview: '{"topic":"LLM"}',
      }),
    ).toBe(`${formatRunTimestamp(startedAt)} · {"topic":"LLM"}`);
  });

  it("omits empty object input previews", () => {
    expect(workflowRunSubtitle({ runId: "run-1", startedAt, inputPreview: "{}" })).toBe(
      formatRunTimestamp(startedAt),
    );
  });
});
