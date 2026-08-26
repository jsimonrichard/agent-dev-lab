import { describe, expect, it } from "bun:test";

import { isPlainObject, valueToClipboardText } from "./json-document";

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
