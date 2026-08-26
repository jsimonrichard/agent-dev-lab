import { describe, expect, it } from "bun:test";

import { formatTranscriptForTitle, sanitizeConversationTitle } from "./conversation-title";

describe("sanitizeConversationTitle", () => {
  it("strips quotes, takes the first line, and trims", () => {
    expect(sanitizeConversationTitle('"CRISPR delivery"\nextra')).toBe("CRISPR delivery");
  });

  it("returns undefined for blank input", () => {
    expect(sanitizeConversationTitle("   \n")).toBeUndefined();
  });
});

describe("formatTranscriptForTitle", () => {
  it("labels user and assistant text", () => {
    expect(
      formatTranscriptForTitle([
        { role: "user", content: "Summarize CRISPR" },
        { role: "assistant", content: "Here is a briefing." },
      ]),
    ).toBe("User: Summarize CRISPR\n\nAssistant: Here is a briefing.");
  });
});
