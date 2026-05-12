import { describe, expect, it } from "bun:test";
import { renderPromptTemplate } from "./render.js";

describe("renderPromptTemplate", () => {
  it("replaces known placeholders", () => {
    expect(
      renderPromptTemplate("Hello {{ name }}!", { name: "Ada" }),
    ).toBe("Hello Ada!");
  });

  it("leaves unknown tokens unchanged", () => {
    expect(renderPromptTemplate("{{ unknown }}", {})).toBe("{{ unknown }}");
  });

  it("treats dotted names as flat keys, not nested paths", () => {
    expect(
      renderPromptTemplate("v={{ a.b }}", { "a.b": "ok" }),
    ).toBe("v=ok");
  });

  it("does not HTML-escape interpolated values", () => {
    expect(renderPromptTemplate("x={{ v }}", { v: "<b>" })).toBe("x=<b>");
  });
});
