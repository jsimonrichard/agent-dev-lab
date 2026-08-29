import { describe, expect, it } from "bun:test";
import type { CoreMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";

import { createTestRuntime } from "../runtime/create-test";
import type { ConversationTitleInput, ConversationTitleOutput } from "./types";

function flattenText(message: CoreMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function mockTextModel(text = "briefing") {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: text },
        { type: "text-end", id: "text-1" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      ]),
    }),
  });
}

describe("AgentImpl streamText prompt", () => {
  it("does not pass system-role messages to the AI SDK messages field", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const adl = createTestRuntime({ defaults: { model: mockTextModel() } });
      const agent = adl.createAgent({
        id: "researcher",
        systemPrompt: "You are a concise research assistant.",
      });

      const result = await agent.run({
        memoryScope: "notes",
        user: "Give a briefing",
      }).result;

      expect(result.text).toContain("briefing");
      expect(result.output).toBe(result.text);
      expect(result.messages.every((message) => message.role !== "system")).toBe(true);
      expect(warnings.some((warning) => warning.includes("System messages in the prompt"))).toBe(
        false,
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("AgentImpl titleWorkflow", () => {
  it("emits agent_title_set after the first episode", async () => {
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("briefing") },
    });
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async () => ({ title: "CRISPR delivery" }),
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });

    const handle = agent.run({
      memoryScope: "notes",
      user: "Summarize CRISPR delivery papers",
    });
    await handle.result;

    const events = await adl.services.stores.workflow?.listEvents({
      agentCallId: handle.agentCallId,
    });
    const titleEvent = events?.find((event) => event.type === "agent_title_set");
    expect(titleEvent).toMatchObject({
      type: "agent_title_set",
      memoryScope: "notes",
      title: "CRISPR delivery",
    });
    expect(agent.titleWorkflowId).toBe("conversation-title");
    expect((await adl.services.stores.workflow?.listRuns())?.map((run) => run.workflowId)).toEqual([
      "conversation-title",
    ]);
  });

  it("does not title a follow-up turn on the same memoryScope", async () => {
    let titleCalls = 0;
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("briefing") },
    });
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async () => {
        titleCalls += 1;
        return { title: "Named once" };
      },
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });

    await agent.run({ memoryScope: "notes", user: "First" }).result;
    await agent.run({ memoryScope: "notes", user: "Second" }).result;

    expect(titleCalls).toBe(1);
  });

  it("does not fail the episode when title generation throws", async () => {
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("briefing") },
    });
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async () => {
        throw new Error("title workflow down");
      },
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });

    const result = await agent.run({
      memoryScope: "notes",
      user: "Summarize CRISPR",
    }).result;

    expect(result.text).toContain("briefing");
  });

  it("records title-helper agent episodes on the isolated title run", async () => {
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("briefing") },
    });
    const namer = adl.createAgent({
      id: "conversation-title-namer",
      systemPrompt: "Name it.",
    });
    const titleWorkflow = adl.createWorkflow<ConversationTitleInput, ConversationTitleOutput>({
      id: "conversation-title",
      run: async (_input, ctx) => {
        const episode = await namer.run({
          memoryScope: ctx.memoryScopeWithSuffix("namer"),
          user: "title please",
        }).result;
        return { title: episode.text };
      },
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
      titleWorkflow,
    });

    await agent.run({ memoryScope: "notes", user: "Summarize CRISPR" }).result;

    const runs = await adl.services.stores.workflow?.listRuns();
    expect(runs?.map((run) => run.workflowId)).toEqual(["conversation-title"]);
    const titleRunId = runs?.[0]?.workflowRunId;
    const episodes = await adl.services.stores.workflow?.listAgentEpisodes();
    const namerEpisodes = episodes?.filter((item) => item.agentId === "conversation-title-namer");
    expect(namerEpisodes).toHaveLength(1);
    expect(namerEpisodes?.[0]?.workflowRunId).toBe(titleRunId);
  });
});

describe("AgentImpl shared memoryScope commits", () => {
  it("records transcript length after each episode so inspectors can slice history", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    const first = agent.run({ memoryScope: "notes", user: "first" });
    await first.result;
    const second = agent.run({ memoryScope: "notes", user: "second" });
    await second.result;

    const firstEvents = await adl.services.stores.workflow?.listEvents({
      agentCallId: first.agentCallId,
    });
    const secondEvents = await adl.services.stores.workflow?.listEvents({
      agentCallId: second.agentCallId,
    });
    const firstCommit = firstEvents?.find((event) => event.type === "agent_messages_committed");
    const secondCommit = secondEvents?.find((event) => event.type === "agent_messages_committed");

    expect(firstCommit).toMatchObject({ type: "agent_messages_committed", total: 3, count: 1 });
    expect(secondCommit).toMatchObject({ type: "agent_messages_committed", total: 5, count: 1 });
  });

  it("pins the system prompt on the first episode and reuses it on follow-up turns", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agentV1 = adl.createAgent({
      id: "researcher",
      systemPrompt: "Pinned prompt A",
    });
    await agentV1.run({ memoryScope: "notes", user: "first" }).result;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const agentV2 = adl.createAgent({
        id: "researcher",
        systemPrompt: "Live prompt B",
      });
      await agentV2.run({ memoryScope: "notes", user: "second" }).result;

      const stored = await adl.services.stores.message.load("notes");
      expect(stored[0]).toEqual({
        role: "system",
        content: "Pinned prompt A",
        providerOptions: { adl: { agentId: "researcher" } },
      });
      expect(warnings.some((warning) => warning.includes("pinned"))).toBe(false);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("AgentImpl optional memoryScope and messages", () => {
  it("accepts an explicit message list and allocates a random scope when omitted", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    const handle = agent.run({
      messages: [{ role: "user", content: "from messages" }],
    });
    const result = await handle.result;

    expect(handle.memoryScope).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.memoryScope).toBe(handle.memoryScope);
    expect(result.messages.some((message) => message.content === "from messages")).toBe(true);
    const stored = await adl.services.stores.message.load(handle.memoryScope);
    expect(stored[0]).toEqual({
      role: "system",
      content: "Be brief.",
      providerOptions: { adl: { agentId: "researcher" } },
    });
  });

  it("does not share history across calls that omit memoryScope", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    const first = await agent.run({ user: "first" }).result;
    const second = await agent.run({ user: "second" }).result;

    expect(first.memoryScope).not.toBe(second.memoryScope);
    expect(second.messages.some((message) => message.content === "first")).toBe(false);
  });

  it("appends an explicit message list onto an existing memoryScope", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    await agent.run({ memoryScope: "notes", user: "first" }).result;
    const result = await agent.run({
      memoryScope: "notes",
      messages: [
        { role: "user", content: "injected user" },
        { role: "assistant", content: "injected assistant" },
        { role: "user", content: "continue" },
      ],
    }).result;

    expect(result.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(result.messages.map((message) => flattenText(message))).toEqual([
      "first",
      "ok",
      "injected user",
      "injected assistant",
      "continue",
      "ok",
    ]);

    const stored = await adl.services.stores.message.load("notes");
    expect(stored.map((message) => flattenText(message))).toEqual([
      "Be brief.",
      "first",
      "ok",
      "injected user",
      "injected assistant",
      "continue",
      "ok",
    ]);
  });
});

describe("AgentImpl system prompt conflict", () => {
  it("warns and keeps the pinned prompt when another agent shares the scope", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const seenPrompts: unknown[] = [];
      const adl = createTestRuntime({
        defaults: {
          model: new MockLanguageModelV2({
            doStream: async (options) => {
              seenPrompts.push(options.prompt);
              return {
                stream: convertArrayToReadableStream([
                  { type: "stream-start", warnings: [] },
                  { type: "text-start", id: "text-1" },
                  { type: "text-delta", id: "text-1", delta: "ok" },
                  { type: "text-end", id: "text-1" },
                  {
                    type: "finish",
                    finishReason: "stop",
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  },
                ]),
              };
            },
          }),
        },
      });
      const researcher = adl.createAgent({
        id: "researcher",
        systemPrompt: "You are a researcher.",
      });
      const editor = adl.createAgent({
        id: "editor",
        systemPrompt: "You are an editor.",
      });

      await researcher.run({ memoryScope: "shared", user: "draft" }).result;
      const editorHandle = editor.run({ memoryScope: "shared", user: "revise" });
      await editorHandle.result;

      expect(warnings.some((warning) => warning.includes('Agent "editor"'))).toBe(true);
      const editorEvents =
        (await adl.services.stores.workflow?.listEvents({
          agentCallId: editorHandle.agentCallId,
        })) ?? [];
      expect(
        editorEvents.some(
          (event) => event.type === "agent_warning" && event.message.includes('Agent "editor"'),
        ),
      ).toBe(true);
      const stored = await adl.services.stores.message.load("shared");
      expect(stored[0]).toEqual({
        role: "system",
        content: "You are a researcher.",
        providerOptions: { adl: { agentId: "researcher" } },
      });
      const secondPrompt = JSON.stringify(seenPrompts[1]);
      expect(secondPrompt).toContain("You are a researcher.");
      expect(secondPrompt).not.toContain("You are an editor.");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("applies this agent's prompt for the episode when systemPromptConflict is use-current", async () => {
    const seenPrompts: unknown[] = [];
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async (options) => {
            seenPrompts.push(options.prompt);
            return {
              stream: convertArrayToReadableStream([
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "text-1" },
                { type: "text-delta", id: "text-1", delta: "ok" },
                { type: "text-end", id: "text-1" },
                {
                  type: "finish",
                  finishReason: "stop",
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                },
              ]),
            };
          },
        }),
      },
    });
    const researcher = adl.createAgent({
      id: "researcher",
      systemPrompt: "You are a researcher.",
    });
    const editor = adl.createAgent({
      id: "editor",
      systemPrompt: "You are an editor.",
    });

    await researcher.run({ memoryScope: "shared", user: "draft" }).result;
    await editor.run({
      memoryScope: "shared",
      user: "revise",
      systemPromptConflict: "use-current",
      suppressSystemPromptConflictWarning: true,
    }).result;

    const stored = await adl.services.stores.message.load("shared");
    expect(stored[0]).toEqual({
      role: "system",
      content: "You are a researcher.",
      providerOptions: { adl: { agentId: "researcher" } },
    });
    const secondPrompt = JSON.stringify(seenPrompts[1]);
    expect(secondPrompt).toContain("You are an editor.");
    expect(secondPrompt).not.toContain("You are a researcher.");
  });

  it("does not warn when suppressSystemPromptConflictWarning is set", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
      const researcher = adl.createAgent({
        id: "researcher",
        systemPrompt: "You are a researcher.",
      });
      const editor = adl.createAgent({
        id: "editor",
        systemPrompt: "You are an editor.",
      });

      await researcher.run({ memoryScope: "shared", user: "draft" }).result;
      await editor.run({
        memoryScope: "shared",
        user: "revise",
        suppressSystemPromptConflictWarning: true,
      }).result;

      expect(warnings.some((warning) => warning.includes("pinned system prompt"))).toBe(false);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("AgentImpl stream and abort", () => {
  it("exposes textStream chunks from agent.stream", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("hello") } });
    const agent = adl.createAgent({
      id: "streamer",
      systemPrompt: "Be brief.",
    });

    const handle = agent.stream({ memoryScope: "notes", user: "hi" });
    let text = "";
    for await (const chunk of handle.textStream) {
      text += chunk;
    }
    const result = await handle.finished;
    expect(text).toContain("hello");
    expect(result.text).toContain("hello");
  });

  it("cancels an in-flight episode via handle.cancel", async () => {
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async ({ abortSignal }) => {
            markStarted();
            await new Promise((_, reject) => {
              abortSignal?.addEventListener(
                "abort",
                () => reject(abortSignal.reason ?? new Error("aborted")),
                { once: true },
              );
            });
            return {
              stream: convertArrayToReadableStream([]),
            };
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "slow",
      systemPrompt: "Be brief.",
    });

    const handle = agent.run({ memoryScope: "notes", user: "hi" });
    await started;
    handle.cancel();
    await expect(handle.result).rejects.toBeTruthy();
  });

  it("aborts streamText when a parent workflow is cancelled", async () => {
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async ({ abortSignal }) => {
            markStarted();
            await new Promise((_, reject) => {
              abortSignal?.addEventListener(
                "abort",
                () => reject(abortSignal.reason ?? new Error("aborted")),
                { once: true },
              );
            });
            return {
              stream: convertArrayToReadableStream([]),
            };
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "child",
      systemPrompt: "Be brief.",
    });
    const workflow = adl.createWorkflow({
      id: "parent",
      run: async (_input, ctx) => {
        await ctx.step("agent", async () => agent.run({ memoryScope: "notes", user: "hi" }).result);
      },
    });

    const handle = workflow.run({});
    await started;
    handle.cancel();
    await expect(handle.result).rejects.toBeTruthy();
    const events = await adl.services.stores.workflow?.listEvents({
      workflowRunId: handle.workflowRunId,
    });
    expect(events?.some((event) => event.type === "workflow_cancelled")).toBe(true);
  });
});
