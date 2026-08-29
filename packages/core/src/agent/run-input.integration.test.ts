/**
 * Keep in sync with apps/playground/src/workflows/shared-scope.ts — same
 * optional-scope / messages / same-agent / cross-agent prompt-conflict scenarios
 * (this file uses MockLanguageModelV2; the playground runs live models).
 */

import { describe, expect, it } from "bun:test";
import type { CoreMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";

import { createTestRuntime } from "../runtime/create-test";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function flattenText(message: CoreMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function mockTextModel(text: string, onPrompt?: (prompt: unknown) => void) {
  return new MockLanguageModelV2({
    doStream: async (options) => {
      onPrompt?.(options.prompt);
      return {
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
      };
    },
  });
}

describe("agent run-input integration", () => {
  it("runs drafter then reviser through a workflow: generated scope, appended messages, same-agent follow-up, prompt conflict", async () => {
    const warnings: string[] = [];
    const prompts: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const adl = createTestRuntime({
        defaults: { model: mockTextModel("ok", (prompt) => prompts.push(prompt)) },
      });
      const drafter = adl.createAgent({
        id: "drafter",
        systemPrompt: "You are a drafter. Write a short first pass and stop.",
      });
      const reviser = adl.createAgent({
        id: "reviser",
        systemPrompt: "You are a reviser. Tighten wording; do not change meaning.",
      });

      const workflow = adl.createWorkflow({
        id: "shared-scope",
        run: async (_input, ctx) => {
          const messagesOnly = await ctx.step("messages-only", async () => {
            const handle = drafter.run({
              messages: [{ role: "user", content: "Draft two sentences about optional scopes." }],
            });
            const result = await handle.result;
            return { memoryScope: handle.memoryScope, result };
          });

          const appended = await ctx.step("append-messages", async () => {
            const result = await drafter.run({
              memoryScope: messagesOnly.memoryScope,
              messages: [
                { role: "user", content: "Injected context." },
                { role: "assistant", content: "Noted." },
                { role: "user", content: "Continue." },
              ],
            }).result;
            return result;
          });

          const sameAgent = await ctx.step("same-agent", async () => {
            const result = await drafter.run({
              memoryScope: messagesOnly.memoryScope,
              user: "Same agent follow-up",
            }).result;
            return result;
          });

          const otherAgent = await ctx.step("other-agent", async () => {
            const result = await reviser.run({
              memoryScope: messagesOnly.memoryScope,
              user: "Tighten the latest draft.",
            }).result;
            return result;
          });

          const useCurrent = await ctx.step("other-agent-use-current", async () => {
            const result = await reviser.run({
              memoryScope: messagesOnly.memoryScope,
              user: "Use my prompt this time.",
              systemPromptConflict: "use-current",
              suppressSystemPromptConflictWarning: true,
            }).result;
            return result;
          });

          return {
            memoryScope: messagesOnly.memoryScope,
            messagesOnly,
            appended,
            sameAgent,
            otherAgent,
            useCurrent,
          };
        },
      });

      const handle = workflow.run({});
      const output = await handle.result;

      expect(output.memoryScope).toMatch(UUID);
      expect(output.messagesOnly.result.memoryScope).toBe(output.memoryScope);
      expect(output.appended.memoryScope).toBe(output.memoryScope);
      expect(output.sameAgent.memoryScope).toBe(output.memoryScope);

      expect(output.appended.messages.map(flattenText)).toEqual([
        "Draft two sentences about optional scopes.",
        "ok",
        "Injected context.",
        "Noted.",
        "Continue.",
        "ok",
      ]);
      expect(output.sameAgent.messages.map(flattenText)).toContain("Same agent follow-up");
      expect(output.sameAgent.messages.map(flattenText)).toContain("Injected context.");

      const stored = await adl.services.stores.message.load(output.memoryScope);
      expect(stored[0]).toEqual({
        role: "system",
        content: "You are a drafter. Write a short first pass and stop.",
        providerOptions: { adl: { agentId: "drafter" } },
      });
      expect(stored.map(flattenText)).toContain("Tighten the latest draft.");
      expect(stored.map(flattenText)).toContain("Use my prompt this time.");

      expect(warnings.some((warning) => warning.includes('Agent "reviser"'))).toBe(true);
      expect(warnings.filter((warning) => warning.includes('Agent "reviser"'))).toHaveLength(1);

      const keepPinnedPrompt = JSON.stringify(prompts[3]);
      expect(keepPinnedPrompt).toContain("You are a drafter.");
      expect(keepPinnedPrompt).not.toContain("You are a reviser.");

      const useCurrentPrompt = JSON.stringify(prompts[4]);
      expect(useCurrentPrompt).toContain("You are a reviser.");
      expect(useCurrentPrompt).not.toContain("You are a drafter.");

      const episodes = await adl.services.stores.workflow?.listAgentEpisodes();
      expect(episodes?.map((episode) => episode.agentId).sort()).toEqual([
        "drafter",
        "drafter",
        "drafter",
        "reviser",
        "reviser",
      ]);
      expect(episodes?.every((episode) => episode.memoryScope === output.memoryScope)).toBe(true);
      expect(episodes?.every((episode) => episode.workflowRunId === handle.workflowRunId)).toBe(
        true,
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
