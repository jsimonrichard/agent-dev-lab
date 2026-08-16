import { describe, expect, it } from "bun:test";

import { highlightJson } from "./highlight-json";

function typesOf(text: string) {
  return highlightJson(text).map((token) => [token.type, token.value] as const);
}

describe("highlightJson", () => {
  it("classifies keys, strings, numbers, booleans, and null", () => {
    const text = JSON.stringify({ name: "demo", count: 3, ok: true, missing: null }, null, 2);

    expect(typesOf(text)).toEqual([
      ["punctuation", "{"],
      ["whitespace", "\n  "],
      ["key", '"name"'],
      ["punctuation", ":"],
      ["whitespace", " "],
      ["string", '"demo"'],
      ["punctuation", ","],
      ["whitespace", "\n  "],
      ["key", '"count"'],
      ["punctuation", ":"],
      ["whitespace", " "],
      ["number", "3"],
      ["punctuation", ","],
      ["whitespace", "\n  "],
      ["key", '"ok"'],
      ["punctuation", ":"],
      ["whitespace", " "],
      ["boolean", "true"],
      ["punctuation", ","],
      ["whitespace", "\n  "],
      ["key", '"missing"'],
      ["punctuation", ":"],
      ["whitespace", " "],
      ["null", "null"],
      ["whitespace", "\n"],
      ["punctuation", "}"],
    ]);
  });

  it("treats strings after a colon as values, including nested objects", () => {
    const text = JSON.stringify({ outer: { inner: "value" }, items: [1, "two"] }, null, 2);
    const keys = highlightJson(text)
      .filter((token) => token.type === "key")
      .map((token) => token.value);
    const strings = highlightJson(text)
      .filter((token) => token.type === "string")
      .map((token) => token.value);

    expect(keys).toEqual(['"outer"', '"inner"', '"items"']);
    expect(strings).toEqual(['"value"', '"two"']);
  });

  it("keeps escaped quotes inside strings", () => {
    const text = JSON.stringify({ quote: 'say "hi"' });
    expect(typesOf(text)).toEqual([
      ["punctuation", "{"],
      ["key", '"quote"'],
      ["punctuation", ":"],
      ["string", '"say \\"hi\\""'],
      ["punctuation", "}"],
    ]);
  });

  it("falls back to plain text when the remainder is not JSON", () => {
    expect(typesOf("not json")).toEqual([["plain", "not json"]]);
  });
});
