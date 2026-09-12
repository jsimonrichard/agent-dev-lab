import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";

import { AdlError, isAdlError } from "../errors";
import type { AgentToolResultEvent } from "../observability/events";
import { createTestRuntime } from "../runtime/create-test";
import { createToolProvider } from "../tools/provider";
import type { ExtendedToolProviderContext } from "../tools/provider";
import type { ConversationTitleInput, ConversationTitleOutput } from "./types";

function flattenText(message: ModelMessage): string {
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
      let capturedPrompt: unknown;
      const adl = createTestRuntime({
        defaults: {
          model: new MockLanguageModelV2({
            doStream: async (options) => {
              capturedPrompt = options.prompt;
              return {
                stream: convertArrayToReadableStream([
                  { type: "stream-start", warnings: [] },
                  { type: "text-start", id: "text-1" },
                  { type: "text-delta", id: "text-1", delta: "briefing" },
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
      const promptJson = JSON.stringify(capturedPrompt);
      // SDK folds `system` into the model prompt; ensure we did not also leak
      // stored system turns as extra system messages (one system + user turn).
      const roles = (capturedPrompt as Array<{ role: string }>).map((message) => message.role);
      expect(roles.filter((role) => role === "system")).toHaveLength(1);
      expect(roles).toContain("user");
      expect(promptJson).toContain("Give a briefing");
      expect(promptJson).toContain("concise research assistant");
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
    await expect(handle.result).rejects.toMatchObject({ name: "AbortError" });
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
    await expect(handle.result).rejects.toMatchObject({ name: "AbortError" });
    const events = await adl.services.stores.workflow?.listEvents({
      workflowRunId: handle.workflowRunId,
    });
    expect(events?.some((event) => event.type === "workflow_cancelled")).toBe(true);
  });
});

describe("AgentImpl outputSchema", () => {
  it("parses structured output from a mock model stream", async () => {
    const schema = z.object({
      title: z.string(),
      score: z.number(),
    });
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: '{"title":"Hello","score":' },
              { type: "text-delta", id: "text-1", delta: "3}" },
              { type: "text-end", id: "text-1" },
              {
                type: "finish",
                finishReason: "stop",
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              },
            ]),
          }),
        }),
      },
    });
    const agent = adl.createAgent({
      id: "structured",
      systemPrompt: "Return JSON.",
      outputSchema: schema,
    });

    const result = await agent.run({ memoryScope: "notes", user: "score this" }).result;
    expect(result.output).toEqual({ title: "Hello", score: 3 });
    expect(result.text).toContain("Hello");
  });
});

const toolUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function toolCallStream(toolName: string, input: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "tool-input-start" as const, id: "call-1", toolName },
      { type: "tool-input-delta" as const, id: "call-1", delta: input },
      { type: "tool-input-end" as const, id: "call-1" },
      { type: "tool-call" as const, toolCallId: "call-1", toolName, input },
      { type: "finish" as const, finishReason: "tool-calls" as const, usage: toolUsage },
    ]),
  };
}

function finalTextStream(text: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: "stop" as const, usage: toolUsage },
    ]),
  };
}

describe("AgentImpl tools", () => {
  it("resolves a ToolProvider on AgentDefinition.tools and executes its tool", async () => {
    let call = 0;
    let receivedCtx: ExtendedToolProviderContext | undefined;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("lookup", JSON.stringify({ topic: "adl" }));
            }
            return finalTextStream("ADL is a workflow framework.");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "provider-tools",
      systemPrompt: "Use tools when helpful.",
      // Object literal implementing ToolProvider directly (not via createToolProvider),
      // to exercise the interface contract itself.
      tools: {
        getTools(ctx: ExtendedToolProviderContext) {
          receivedCtx = ctx;
          return {
            lookup: tool({
              description: "Look up a topic",
              inputSchema: z.object({ topic: z.string() }),
              execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
            }),
          };
        },
      },
    });

    const result = await agent.run({ memoryScope: "provider-notes", user: "What is ADL?" }).result;

    expect(result.text).toContain("workflow framework");
    expect(receivedCtx?.agentId).toBe("provider-tools");
    expect(receivedCtx?.memoryScope).toBe("provider-notes");
  });

  it("per-call tools override wins over AgentDefinition.tools for the same key", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("lookup", JSON.stringify({ topic: "adl" }));
            }
            return finalTextStream("done");
          },
        }),
      },
    });
    const seen: string[] = [];
    const agent = adl.createAgent({
      id: "override-tools",
      systemPrompt: "Use tools when helpful.",
      tools: {
        lookup: tool({
          description: "definition version",
          inputSchema: z.object({ topic: z.string() }),
          execute: async () => {
            seen.push("definition");
            return "definition result";
          },
        }),
      },
    });

    await agent.run({
      memoryScope: "override-notes",
      user: "What is ADL?",
      tools: {
        lookup: tool({
          description: "override version",
          inputSchema: z.object({ topic: z.string() }),
          execute: async () => {
            seen.push("override");
            return "override result";
          },
        }),
      },
    }).result;

    expect(seen).toEqual(["override"]);
  });

  it("createToolProvider gives a typed ctx.toolProviderContext end to end via agent.run", async () => {
    type SandboxContext = { root: string };
    let call = 0;
    let seenRoot: string | undefined;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("whoami", "{}");
            }
            return finalTextStream("done");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "typed-provider-tools",
      systemPrompt: "Use tools when helpful.",
      tools: createToolProvider<SandboxContext>({
        getTools: (ctx) => {
          seenRoot = ctx.toolProviderContext?.root;
          return {
            whoami: tool({
              description: "report the sandbox root",
              inputSchema: z.object({}),
              execute: async () => ctx.toolProviderContext?.root ?? "unknown",
            }),
          };
        },
      }),
    });

    await agent.run({
      memoryScope: "typed-provider-notes",
      user: "where are we?",
      toolProviderContext: { root: "/tmp/sandbox" },
    }).result;

    expect(seenRoot).toBe("/tmp/sandbox");
  });
});

describe("AgentImpl streaming tool results", () => {
  it("emits one agent_tool_result per yielded value, preliminary except the last", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("longRunning", "{}");
            }
            return finalTextStream("done");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "streaming-tool",
      systemPrompt: "Use tools when helpful.",
      tools: {
        longRunning: tool({
          description: "a tool that streams progress before finishing",
          inputSchema: z.object({}),
          execute: async function* () {
            yield "partial 1";
            yield "partial 2";
            yield "final result";
          },
        }),
      },
    });

    const handle = agent.run({ memoryScope: "streaming-notes", user: "run it" });
    await handle.result;

    const events = await adl.services.stores.workflow?.listEvents({
      agentCallId: handle.agentCallId,
    });
    const toolResultEvents =
      events?.filter(
        (event): event is AgentToolResultEvent => event.type === "agent_tool_result",
      ) ?? [];

    // The AI SDK's own `executeTool` yields every value from the loop as `preliminary`
    // (including the last one), then re-emits that same last value once more as `final` —
    // so N yields produce N+1 events, not N.
    expect(toolResultEvents.map((event) => event.result)).toEqual([
      "partial 1",
      "partial 2",
      "final result",
      "final result",
    ]);
    expect(toolResultEvents.map((event) => event.preliminary)).toEqual([
      true,
      true,
      true,
      undefined,
    ]);
  });
});

describe("ToolProvider-owned context validation", () => {
  it("applies a Zod default when the provider parses its own toolProviderContext", async () => {
    let call = 0;
    let seenRoot: string | undefined;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("whoami", "{}");
            }
            return finalTextStream("done");
          },
        }),
      },
    });
    const contextSchema = z.object({ root: z.string().default("/default/sandbox") });
    const agent = adl.createAgent({
      id: "context-defaults",
      systemPrompt: "Use tools when helpful.",
      tools: createToolProvider<z.input<typeof contextSchema>>({
        getTools: (ctx) => {
          const parsed = contextSchema.parse(ctx.toolProviderContext);
          seenRoot = parsed.root;
          return {
            whoami: tool({
              description: "report the sandbox root",
              inputSchema: z.object({}),
              execute: async () => parsed.root,
            }),
          };
        },
        contextSchema,
      }),
    });

    // `root` omitted from the raw object — the schema's default should fill it in.
    await agent.run({
      memoryScope: "context-defaults-notes",
      user: "where are we?",
      toolProviderContext: {},
    }).result;

    expect(seenRoot).toBe("/default/sandbox");
  });

  it("propagates AdlError INVALID_CONTEXT when a provider throws its own on invalid input", async () => {
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => finalTextStream("unreachable"),
        }),
      },
    });
    const contextSchema = z.object({ root: z.string() });
    const agent = adl.createAgent({
      id: "context-invalid",
      systemPrompt: "Use tools when helpful.",
      tools: createToolProvider<z.input<typeof contextSchema>>({
        getTools: (ctx) => {
          try {
            contextSchema.parse(ctx.toolProviderContext);
          } catch (error) {
            throw new AdlError("INVALID_CONTEXT", "Invalid toolProviderContext", { cause: error });
          }
          return {};
        },
        contextSchema,
      }),
    });

    let caught: unknown;
    try {
      await agent.run({
        memoryScope: "context-invalid-notes",
        user: "where are we?",
        // @ts-expect-error -- deliberately wrong shape to exercise the parse failure
        toolProviderContext: { root: 42 },
      }).result;
    } catch (error) {
      caught = error;
    }

    expect(isAdlError(caught)).toBe(true);
    expect(caught && isAdlError(caught) && caught.code).toBe("INVALID_CONTEXT");
  });

  it("exposes definition.tools via agent.tools for UI introspection of contextSchema", () => {
    const adl = createTestRuntime({
      defaults: { model: new MockLanguageModelV2({ doStream: async () => finalTextStream("ok") }) },
    });
    const contextSchema = z.object({ root: z.string() });
    const agent = adl.createAgent({
      id: "context-introspection",
      systemPrompt: "Use tools when helpful.",
      tools: createToolProvider<z.input<typeof contextSchema>>({
        getTools: () => ({}),
        contextSchema,
      }),
    });

    expect(typeof agent.tools?.getTools).toBe("function");
    expect(agent.tools?.contextSchema).toBe(contextSchema);
  });
});

describe("AgentImpl onRunEnd", () => {
  it("calls onRunEnd after a successful turn with the same agentCallId getTools saw", async () => {
    const ends: string[] = [];
    let getToolsCallId: string | undefined;
    const adl = createTestRuntime({
      defaults: { model: mockTextModel("ok") },
      projectRoot: "/tmp/adl-project",
    });
    const agent = adl.createAgent({
      id: "on-run-end-ok",
      systemPrompt: "Be brief.",
      tools: createToolProvider({
        getTools: (ctx) => {
          getToolsCallId = ctx.agentCallId;
          expect(ctx.projectRoot).toBe("/tmp/adl-project");
          return {};
        },
        onRunEnd: (ctx) => {
          ends.push(ctx.agentCallId);
        },
      }),
    });

    const handle = agent.run({ memoryScope: "notes", user: "hi" });
    await handle.result;
    expect(ends).toEqual([handle.agentCallId]);
    expect(getToolsCallId).toBe(handle.agentCallId);
  });

  it("calls onRunEnd after a failed turn and prefers the turn error", async () => {
    const ends: string[] = [];
    // No model → turn fails before streamText; onRunEnd must still run.
    const adl = createTestRuntime({});
    const agent = adl.createAgent({
      id: "on-run-end-fail",
      systemPrompt: "Be brief.",
      tools: createToolProvider({
        getTools: () => ({}),
        onRunEnd: () => {
          ends.push("ended");
        },
      }),
    });

    await expect(agent.run({ memoryScope: "notes", user: "hi" }).result).rejects.toMatchObject({
      code: "MISSING_MODEL",
    });
    expect(ends).toEqual(["ended"]);
  });

  it("calls onRunEnd on both definition and per-call input tools", async () => {
    const ends: string[] = [];
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "on-run-end-both",
      systemPrompt: "Be brief.",
      tools: createToolProvider({
        getTools: () => ({}),
        onRunEnd: () => {
          ends.push("definition");
        },
      }),
    });

    await agent.run({
      memoryScope: "notes",
      user: "hi",
      tools: createToolProvider({
        getTools: () => ({}),
        onRunEnd: () => {
          ends.push("input");
        },
      }),
    }).result;
    expect(ends).toEqual(["definition", "input"]);
  });

  it("rejects the run when onRunEnd fails after a successful turn", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "on-run-end-throws",
      systemPrompt: "Be brief.",
      tools: createToolProvider({
        getTools: () => ({}),
        onRunEnd: () => {
          throw new Error("cleanup failed");
        },
      }),
    });

    await expect(agent.run({ memoryScope: "notes", user: "hi" }).result).rejects.toThrow(
      "cleanup failed",
    );
  });

  it("still runs sibling onRunEnd when one throws after success", async () => {
    const ends: string[] = [];
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "on-run-end-siblings",
      systemPrompt: "Be brief.",
      tools: createToolProvider({
        getTools: () => ({}),
        onRunEnd: () => {
          ends.push("definition");
          throw new Error("definition cleanup failed");
        },
      }),
    });

    await expect(
      agent.run({
        memoryScope: "notes",
        user: "hi",
        tools: createToolProvider({
          getTools: () => ({}),
          onRunEnd: () => {
            ends.push("input");
          },
        }),
      }).result,
    ).rejects.toThrow("definition cleanup failed");
    expect(ends.sort()).toEqual(["definition", "input"]);
  });
});

describe("AgentImpl run tags", () => {
  it("records caller tags plus the configured version on agent_started", async () => {
    const adl = createTestRuntime({
      version: "1.4.0",
      defaults: { model: mockTextModel("ok") },
    });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    const handle = agent.run({
      memoryScope: "notes",
      user: "hi",
      tags: ["dataset:qa-v1"],
    });
    await handle.result;

    const started = await adl.services.stores.workflow?.getLatestEvent(
      { agentCallId: handle.agentCallId },
      "agent_started",
    );
    expect(started?.tags).toEqual(["dataset:qa-v1", "version:1.4.0"]);
  });

  it("does not invent a version tag when tagging is disabled", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("ok") } });
    const agent = adl.createAgent({
      id: "researcher",
      systemPrompt: "Be brief.",
    });

    const handle = agent.run({
      memoryScope: "notes",
      user: "hi",
      tags: ["dataset:qa-v1"],
    });
    await handle.result;

    const started = await adl.services.stores.workflow?.getLatestEvent(
      { agentCallId: handle.agentCallId },
      "agent_started",
    );
    expect(started?.tags).toEqual(["dataset:qa-v1"]);
  });
});
