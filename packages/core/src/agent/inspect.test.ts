import { describe, expect, it } from "bun:test";
import type { LanguageModel } from "ai";

import { err, ok } from "../result";
import { createAdlRuntime } from "../runtime/create";
import { createTestRuntime } from "../runtime/create-test";
import { CUSTOM_MODEL_ID, inspectLanguageModel } from "./inspect";
import type { ConversationTitleInput, ConversationTitleOutput } from "./types";

function fakeModel(overrides: Partial<{ provider: string; modelId: string }> = {}): LanguageModel {
  return {
    specificationVersion: "v2",
    provider: "fake-provider",
    modelId: "fake-model",
    ...overrides,
  } as unknown as LanguageModel;
}

describe("inspectLanguageModel", () => {
  it("returns the id for string models", () => {
    expect(inspectLanguageModel("openai/gpt-4o-mini")).toEqual({ modelId: "openai/gpt-4o-mini" });
  });

  it("returns id and provider for model objects", () => {
    expect(
      inspectLanguageModel(fakeModel({ provider: "openai.chat", modelId: "gpt-4o-mini" })),
    ).toEqual({
      modelId: "gpt-4o-mini",
      provider: "openai.chat",
    });
  });

  it("returns null when no model is set or the id is blank", () => {
    expect(inspectLanguageModel(undefined)).toBeNull();
    expect(inspectLanguageModel("   ")).toBeNull();
    expect(inspectLanguageModel(fakeModel({ provider: "", modelId: "  " }))).toBeNull();
  });

  it("reports custom when only the provider is known", () => {
    expect(inspectLanguageModel(fakeModel({ provider: "acme", modelId: "" }))).toEqual({
      modelId: CUSTOM_MODEL_ID,
      provider: "acme",
    });
  });
});

describe("Agent.modelInfo", () => {
  it("reports the agent's own model over the runtime default", () => {
    const adl = createAdlRuntime({
      defaults: { model: fakeModel({ provider: "default", modelId: "default-model" }) },
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      model: fakeModel({ provider: "openai.chat", modelId: "gpt-4o-mini" }),
    });
    expect(agent.modelInfo).toEqual({ modelId: "gpt-4o-mini", provider: "openai.chat" });
  });

  it("falls back to the runtime default model", () => {
    const adl = createAdlRuntime({
      defaults: { model: fakeModel({ provider: "openai.chat", modelId: "gpt-4o-mini" }) },
    });
    const agent = adl.createAgent({ id: "researcher", systemPrompt: "Be brief." });
    expect(agent.modelInfo).toEqual({ modelId: "gpt-4o-mini", provider: "openai.chat" });
  });

  it("is null when neither agent nor runtime configure a model", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "researcher", systemPrompt: "Be brief." });
    expect(agent.modelInfo).toBeNull();
  });
});

describe("Agent.titleWorkflowId", () => {
  it("is null when no title workflow is configured", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "researcher", systemPrompt: "Be brief." });
    expect(agent.titleWorkflowId).toBeNull();
  });

  it("reports the configured title workflow id", () => {
    const adl = createTestRuntime();
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async () => ({ title: "Named" }),
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });
    expect(agent.titleWorkflowId).toBe("conversation-title");
  });
});

describe("Agent.systemPrompt", () => {
  it("returns string system prompts as ok", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "researcher", systemPrompt: "Be brief." });
    expect(agent.systemPrompt).toEqual(ok("Be brief."));
    expect(agent.systemPromptPath).toBeNull();
  });

  it("returns err when a template cannot render", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: {
        name: "broken",
        source: "",
        render: () => {
          throw new Error("missing demo data");
        },
      },
    });
    expect(agent.systemPrompt).toEqual(err("missing demo data"));
  });
});
