import { z } from "zod";

import { adl } from "#adl";

import { drafter } from "../agents/drafter";
import { reviser } from "../agents/reviser";

const sharedScopeInput = z.object({
  topic: z.string().default("Why memoryScope is optional"),
});

const turnSchema = z.object({
  memoryScope: z.string(),
  text: z.string(),
  messageCount: z.number(),
});

/**
 * Keep in sync with packages/core/src/agent/run-input.integration.test.ts.
 *
 * Exercises agent run-input flexibility on one conversation:
 * messages without a scope, appending `messages` onto that scope, a same-agent
 * follow-up, then a different agent with a different system prompt.
 */
export const sharedScope = adl.createWorkflow({
  id: "shared-scope",
  input: sharedScopeInput,
  output: z.object({
    memoryScope: z.string(),
    messagesOnly: turnSchema,
    appended: turnSchema,
    sameAgent: turnSchema,
    otherAgent: turnSchema,
  }),
  async run(input, ctx) {
    const { topic } = sharedScopeInput.parse(input);
    await ctx.setTitle(`Shared scope: ${topic}`);

    const messagesOnly = await ctx.step("messages-only", async () => {
      const handle = drafter.run({
        messages: [{ role: "user", content: `Draft two sentences about: ${topic}` }],
      });
      const result = await handle.result;
      return {
        memoryScope: result.memoryScope,
        text: result.text,
        messageCount: result.messages.length,
      };
    });

    const appended = await ctx.step("append-messages", async () => {
      const result = await drafter.run({
        memoryScope: messagesOnly.memoryScope,
        messages: [{ role: "user", content: "Keep the same thread. Add one concrete example." }],
      }).result;
      return {
        memoryScope: result.memoryScope,
        text: result.text,
        messageCount: result.messages.length,
      };
    });

    const sameAgent = await ctx.step("same-agent", async () => {
      const result = await drafter.run({
        memoryScope: messagesOnly.memoryScope,
        user: "Same agent, same scope — this is the intended follow-up.",
      }).result;
      return {
        memoryScope: result.memoryScope,
        text: result.text,
        messageCount: result.messages.length,
      };
    });

    const otherAgent = await ctx.step("other-agent", async () => {
      const result = await reviser.run({
        memoryScope: messagesOnly.memoryScope,
        user: "Tighten the latest draft.",
        suppressSystemPromptConflictWarning: true,
      }).result;
      return {
        memoryScope: result.memoryScope,
        text: result.text,
        messageCount: result.messages.length,
      };
    });

    return {
      memoryScope: messagesOnly.memoryScope,
      messagesOnly,
      appended,
      sameAgent,
      otherAgent,
    };
  },
});
