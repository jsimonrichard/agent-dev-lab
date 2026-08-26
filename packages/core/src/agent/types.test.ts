import { tool } from "ai";
import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { createTestRuntime } from "../runtime/create-test";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

describe("Agent TOutput inference", () => {
  it("defaults to string when outputSchema is omitted", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "plain", systemPrompt: "Be brief." });
    type Output = Awaited<ReturnType<(typeof agent)["run"]>["result"]>["output"];
    const check: Expect<Equal<Output, string>> = true;
    expect(agent.id).toBe("plain");
    expect(check).toBe(true);
  });

  it("infers structured output from outputSchema", () => {
    const adl = createTestRuntime();
    const schema = z.object({
      title: z.string(),
      count: z.number(),
    });
    const agent = adl.createAgent({
      id: "structured",
      systemPrompt: "Be brief.",
      outputSchema: schema,
    });
    type Output = Awaited<ReturnType<(typeof agent)["run"]>["result"]>["output"];
    const check: Expect<Equal<Output, z.infer<typeof schema>>> = true;
    expect(agent.id).toBe("structured");
    expect(check).toBe(true);
  });

  it("infers TOutput alongside a concrete tools set", () => {
    const adl = createTestRuntime();
    const schema = z.object({ summary: z.string() });
    const agent = adl.createAgent({
      id: "tooled",
      systemPrompt: "Be brief.",
      tools: {
        ping: tool({
          description: "Ping",
          inputSchema: z.object({ n: z.number() }),
          execute: async ({ n }) => n,
        }),
      },
      outputSchema: schema,
    });
    type Output = Awaited<ReturnType<(typeof agent)["run"]>["result"]>["output"];
    const check: Expect<Equal<Output, z.infer<typeof schema>>> = true;
    expect(agent.id).toBe("tooled");
    expect(check).toBe(true);
  });
});
