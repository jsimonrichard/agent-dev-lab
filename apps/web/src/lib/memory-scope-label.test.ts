import { describe, expect, it } from "bun:test";

import {
  displayConversationTitle,
  formatMemoryScopeLabel,
  generatedForkTitle,
} from "./memory-scope-label";

describe("formatMemoryScopeLabel", () => {
  it("strips a matching run id prefix", () => {
    expect(formatMemoryScopeLabel("run-1:notes", "run-1")).toBe("notes");
  });

  it("strips a UUID namespace without a run id", () => {
    expect(formatMemoryScopeLabel("caf8ddcc-e875-47c7-acde-2931ae2343f5:notes")).toBe("notes");
  });

  it("labels generated inspector scopes", () => {
    expect(formatMemoryScopeLabel("fork:abc")).toBe("this conversation");
    expect(formatMemoryScopeLabel("conv:abc")).toBe("this conversation");
  });
});

describe("displayConversationTitle", () => {
  const fork = {
    sourceEpisodeId: "ep-1",
    sourceMemoryScope: "run-1:notes",
    sourceRunId: "run-1",
  };

  it("rewrites generated fork titles that embedded the episode id", () => {
    expect(displayConversationTitle("Fork · ep-1", fork)).toBe("Fork · notes");
  });

  it("leaves user titles alone", () => {
    expect(displayConversationTitle("My fork", fork)).toBe("My fork");
  });
});

describe("generatedForkTitle", () => {
  it("uses the short memory scope", () => {
    expect(generatedForkTitle("run-1:critique", "run-1")).toBe("Fork · critique");
  });
});
