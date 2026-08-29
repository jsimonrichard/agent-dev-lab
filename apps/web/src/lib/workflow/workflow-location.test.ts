import { describe, expect, it } from "bun:test";

import {
  formatRunTimestamp,
  parseWorkflowRunSearch,
  workflowRunLabel,
  workflowRunSearch,
  workflowRunSubtitle,
} from "./workflow-location";

describe("parseWorkflowRunSearch", () => {
  it("keeps step and episode ids", () => {
    expect(parseWorkflowRunSearch({ step: "s1", episode: "e1", extra: 1 })).toEqual({
      step: "s1",
      episode: "e1",
    });
  });

  it("drops empty or non-string values", () => {
    expect(parseWorkflowRunSearch({ step: "", episode: 2 })).toEqual({});
  });
});

describe("workflowRunSearch", () => {
  it("omits empty selection fields", () => {
    expect(workflowRunSearch({})).toEqual({});
    expect(workflowRunSearch({ step: "s1" })).toEqual({ step: "s1" });
    expect(workflowRunSearch({ step: "s1", episode: "e1" })).toEqual({ step: "s1", episode: "e1" });
  });
});

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

  it("does not repeat the run id when a title is set", () => {
    expect(workflowRunSubtitle({ runId: "run-1", title: "My run", startedAt })).toBe(
      formatRunTimestamp(startedAt),
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
