import type { ModelMessage } from "ai";
import { describe, expect, it } from "bun:test";

import { err, ok } from "../result";
import type { Template } from "../template/types";
import {
  formatSystemPromptConflictWarning,
  inspectSystemPrompt,
  inspectSystemPromptPath,
  resolveEpisodeSystemPrompt,
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
  it("reads the pinning agent id from a stored system message", () => {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: "You are helpful.",
        providerOptions: { adl: { agentId: "researcher" } },
      },
      { role: "user", content: "Hi" },
    ];
    expect(splitStoredSystemPrompt(messages).agentId).toBe("researcher");
  });

  it("extracts a leading system message from the store", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    expect(splitStoredSystemPrompt(messages)).toEqual({
      systemPrompt: "You are helpful.",
      agentId: null,
      transcript: [{ role: "user", content: "Hi" }],
    });
  });

  it("strips stray system messages when there is no leading pin", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hi" },
      { role: "system", content: "stray" },
    ];
    expect(splitStoredSystemPrompt(messages)).toEqual({
      systemPrompt: null,
      agentId: null,
      transcript: [{ role: "user", content: "Hi" }],
    });
  });
});

describe("withStoredSystemPrompt", () => {
  it("prepends a system message and strips duplicates", () => {
    const transcript: ModelMessage[] = [
      { role: "system", content: "old" },
      { role: "user", content: "Hi" },
    ];
    expect(withStoredSystemPrompt("Pinned", transcript)).toEqual([
      { role: "system", content: "Pinned" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("records the pinning agent id when provided", () => {
    expect(withStoredSystemPrompt("Pinned", [], { agentId: "researcher" })[0]).toEqual({
      role: "system",
      content: "Pinned",
      providerOptions: { adl: { agentId: "researcher" } },
    });
  });
});

describe("resolveEpisodeSystemPrompt", () => {
  it("uses the current prompt when nothing is pinned", () => {
    expect(
      resolveEpisodeSystemPrompt({
        storedSystemPrompt: null,
        currentSystemPrompt: "You are B.",
        currentAgentId: "editor",
      }),
    ).toEqual({ systemPrompt: "You are B.", conflict: false });
  });

  it("is not a conflict when the same agent continues the scope", () => {
    expect(
      resolveEpisodeSystemPrompt({
        storedSystemPrompt: "You are A.",
        currentSystemPrompt: "You are A (reloaded).",
        storedAgentId: "researcher",
        currentAgentId: "researcher",
      }),
    ).toEqual({ systemPrompt: "You are A.", conflict: false });
  });

  it("is not a conflict when another agent uses the same prompt text", () => {
    expect(
      resolveEpisodeSystemPrompt({
        storedSystemPrompt: "Be brief.",
        currentSystemPrompt: "Be brief.",
        storedAgentId: "researcher",
        currentAgentId: "editor",
      }),
    ).toEqual({ systemPrompt: "Be brief.", conflict: false });
  });

  it("keeps the pin by default when a different agent has a different prompt", () => {
    expect(
      resolveEpisodeSystemPrompt({
        storedSystemPrompt: "You are A.",
        currentSystemPrompt: "You are B.",
        storedAgentId: "researcher",
        currentAgentId: "editor",
      }),
    ).toEqual({ systemPrompt: "You are A.", conflict: true });
  });

  it("applies the current prompt when strategy is use-current", () => {
    expect(
      resolveEpisodeSystemPrompt({
        storedSystemPrompt: "You are A.",
        currentSystemPrompt: "You are B.",
        storedAgentId: "researcher",
        currentAgentId: "editor",
        strategy: "use-current",
      }),
    ).toEqual({ systemPrompt: "You are B.", conflict: true });
  });
});

describe("formatSystemPromptConflictWarning", () => {
  it("names the agent, scope, and default strategy", () => {
    expect(
      formatSystemPromptConflictWarning({
        agentId: "editor",
        scopeAgentId: "researcher",
        memoryScope: "notes",
        strategy: "keep-pinned",
      }),
    ).toContain('started by agent "researcher"');
  });
});
