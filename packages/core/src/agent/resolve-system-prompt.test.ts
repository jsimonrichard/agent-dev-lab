import type { CoreMessage } from "ai";
import { describe, expect, it } from "bun:test";

import { err, ok } from "../result";
import type { Template } from "../template/types";
import {
  inspectSystemPrompt,
  inspectSystemPromptPath,
  resolveSystemPromptText,
  splitStoredSystemPrompt,
  withStoredSystemPrompt,
} from "./resolve-system-prompt";

function stubTemplate<TInput>(
  template: Pick<Template<TInput>, "render" | "demo" | "path">,
): Template<TInput> {
  return { name: "stub", source: "", ...template };
}

describe("resolveSystemPromptText", () => {
  it("returns string system prompts as-is", () => {
    expect(resolveSystemPromptText("You are helpful.")).toBe("You are helpful.");
  });

  it("renders a template with demo data when present", () => {
    expect(
      resolveSystemPromptText(
        stubTemplate({
          demo: { role: "editor" },
          render: (data) => `You are an ${data.role}.`,
        }),
      ),
    ).toBe("You are an editor.");
  });

  it("renders a template with an empty object when demo is absent", () => {
    expect(resolveSystemPromptText(stubTemplate({ render: () => "You are helpful." }))).toBe(
      "You are helpful.",
    );
  });
});

describe("inspectSystemPromptPath", () => {
  it("is null for string system prompts", () => {
    expect(inspectSystemPromptPath("You are helpful.")).toBeNull();
  });

  it("returns the template path when present", () => {
    expect(inspectSystemPromptPath(stubTemplate({ path: "./outliner.md", render: () => "" }))).toBe(
      "./outliner.md",
    );
  });

  it("is null when a template has no path", () => {
    expect(inspectSystemPromptPath(stubTemplate({ render: () => "" }))).toBeNull();
  });
});

describe("inspectSystemPrompt", () => {
  it("returns ok with the resolved text", () => {
    expect(inspectSystemPrompt("You are helpful.")).toEqual(ok("You are helpful."));
  });

  it("returns err when template render throws", () => {
    expect(
      inspectSystemPrompt(
        stubTemplate({
          render: () => {
            throw new Error("missing demo data");
          },
        }),
      ),
    ).toEqual(err("missing demo data"));
  });
});

describe("splitStoredSystemPrompt", () => {
  it("extracts a leading system message from the store", () => {
    const messages: CoreMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    expect(splitStoredSystemPrompt(messages)).toEqual({
      systemPrompt: "You are helpful.",
      transcript: [{ role: "user", content: "Hi" }],
    });
  });

  it("strips stray system messages when there is no leading pin", () => {
    const messages: CoreMessage[] = [
      { role: "user", content: "Hi" },
      { role: "system", content: "stray" },
    ];
    expect(splitStoredSystemPrompt(messages)).toEqual({
      systemPrompt: null,
      transcript: [{ role: "user", content: "Hi" }],
    });
  });
});

describe("withStoredSystemPrompt", () => {
  it("prepends a system message and strips duplicates", () => {
    const transcript: CoreMessage[] = [
      { role: "system", content: "old" },
      { role: "user", content: "Hi" },
    ];
    expect(withStoredSystemPrompt("Pinned", transcript)).toEqual([
      { role: "system", content: "Pinned" },
      { role: "user", content: "Hi" },
    ]);
  });
});
