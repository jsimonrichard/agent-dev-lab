import { describe, expect, it } from "bun:test";

import { isPlainObject, looksLikeProse, valueToClipboardText } from "./json-document";

describe("looksLikeProse", () => {
  it("treats multiline strings as prose", () => {
    expect(looksLikeProse("line one\nline two")).toBe(true);
  });

  it("treats markdown syntax as prose", () => {
    expect(looksLikeProse("See **bold** text")).toBe(true);
    expect(looksLikeProse("# Heading")).toBe(true);
    expect(looksLikeProse("- item")).toBe(true);
    expect(looksLikeProse("[paper](https://example.com)")).toBe(true);
    expect(looksLikeProse("Use `code` here")).toBe(true);
  });

  it("treats phrases and medium-length sentences as prose", () => {
    expect(looksLikeProse("LLM agents")).toBe(true);
    expect(looksLikeProse("A specific, compelling article title.")).toBe(true);
    expect(looksLikeProse("Cover the history of CRISPR delivery methods.")).toBe(true);
    expect(
      looksLikeProse(
        "This briefing covers recent surveys of agent memory systems, retrieval, and the open questions they leave for evaluation.",
      ),
    ).toBe(true);
  });

  it("keeps single tokens, ids, and bare URLs inline", () => {
    expect(looksLikeProse("literature-review")).toBe(false);
    expect(looksLikeProse("ship")).toBe(false);
    expect(looksLikeProse("gpt-4o")).toBe(false);
    expect(looksLikeProse("")).toBe(false);
    expect(
      looksLikeProse("https://arxiv.org/abs/2401.00001/this-is-a-long-path-without-spaces"),
    ).toBe(false);
    expect(looksLikeProse("www.example.com/path")).toBe(false);
  });
});

describe("isPlainObject", () => {
  it("accepts objects and rejects arrays, null, and primitives", () => {
    expect(isPlainObject({ briefing: "ok" })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("text")).toBe(false);
  });
});

describe("valueToClipboardText", () => {
  it("copies strings as raw markdown, not JSON-quoted", () => {
    expect(valueToClipboardText("# Heading\n\nA paragraph.")).toBe("# Heading\n\nA paragraph.");
  });

  it("copies primitives as unquoted text", () => {
    expect(valueToClipboardText(3)).toBe("3");
    expect(valueToClipboardText(true)).toBe("true");
    expect(valueToClipboardText(null)).toBe("null");
    expect(valueToClipboardText(undefined)).toBe("");
  });

  it("pretty-prints objects and arrays", () => {
    expect(valueToClipboardText({ briefing: "ok", count: 1 })).toBe(
      '{\n  "briefing": "ok",\n  "count": 1\n}',
    );
    expect(valueToClipboardText(["a", "b"])).toBe('[\n  "a",\n  "b"\n]');
  });
});
