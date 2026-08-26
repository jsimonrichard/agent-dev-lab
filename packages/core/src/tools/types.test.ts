import { describe, expect, it } from "bun:test";
import type { InferToolInput, InferToolOutput } from "ai";
import { z } from "zod";

import { createTestRuntime } from "../runtime/create-test";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

describe("createToolFromAgent typing", () => {
  it("uses string output when the agent has no outputSchema", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "plain", systemPrompt: "Be brief." });
    const wrapped = adl.createToolFromAgent(agent, {
      description: "Run the agent",
      mapRun: () => ({ memoryScope: "s" }),
    });
    type Output = InferToolOutput<typeof wrapped>;
    const check: Expect<Equal<Output, string>> = true;
    expect(wrapped.description).toBe("Run the agent");
    expect(check).toBe(true);
  });

  it("matches the agent's structured output and inputSchema", () => {
    const adl = createTestRuntime();
    const outputSchema = z.object({ title: z.string() });
    const inputSchema = z.object({ query: z.string(), threadId: z.string() });
    const agent = adl.createAgent({
      id: "structured",
      systemPrompt: "Be brief.",
      outputSchema,
    });
    const wrapped = adl.createToolFromAgent(agent, {
      description: "Run the agent",
      inputSchema,
      mapRun: (args) => ({
        memoryScope: args.threadId,
        user: args.query,
      }),
    });
    type Output = InferToolOutput<typeof wrapped>;
    type Input = InferToolInput<typeof wrapped>;
    const outputCheck: Expect<Equal<Output, z.infer<typeof outputSchema>>> = true;
    const inputCheck: Expect<Equal<Input, z.infer<typeof inputSchema>>> = true;
    expect(wrapped.description).toBe("Run the agent");
    expect(outputCheck).toBe(true);
    expect(inputCheck).toBe(true);
  });
});

describe("createToolFromWorkflow typing", () => {
  it("matches the workflow's output type", () => {
    const adl = createTestRuntime();
    const outputSchema = z.object({ answer: z.string() });
    const workflow = adl.createWorkflow({
      id: "qa",
      output: outputSchema,
      run: async () => ({ answer: "ok" }),
    });
    const wrapped = adl.createToolFromWorkflow(workflow, {
      description: "Run the workflow",
    });
    type Output = InferToolOutput<typeof wrapped>;
    const check: Expect<Equal<Output, z.infer<typeof outputSchema>>> = true;
    expect(wrapped.description).toBe("Run the workflow");
    expect(check).toBe(true);
  });
});
