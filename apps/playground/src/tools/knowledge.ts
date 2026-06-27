import { tool } from "@agent-dev-lab/core";
import { z } from "zod";

/**
 * Tiny in-memory "knowledge base" the research assistant can query. Real projects
 * would back this with a vector store or API call; here it is deterministic so the
 * demo is reproducible.
 */
const KNOWLEDGE_BASE: Record<string, string> = {
  adl: "Agent Dev Lab (ADL) is a headless TypeScript framework for building agentic workflows on top of the Vercel AI SDK. Workflows orchestrate plain TypeScript; agents are single-step model episodes.",
  agent:
    "In ADL an agent is a reusable model configuration: instructions, a model, optional tools, and an optional structured-output schema. Each agent.run() is exactly one AI SDK step.",
  workflow:
    "An ADL workflow is a plain async TypeScript function. It uses ctx.step() for observable, cacheable spans and can call agents, tools, and nested workflows.",
  "vercel ai sdk":
    "The Vercel AI SDK provides streamText/generateText, tool calling, and structured output. ADL wraps streamText for every agent episode.",
  memoryscope:
    "A memoryScope is an opaque string that selects a conversation transcript in the MessageStore. The same agent + same memoryScope shares history.",
};

function lookup(topic: string): string {
  const key = topic.trim().toLowerCase();
  const exact = KNOWLEDGE_BASE[key];
  if (exact) {
    return exact;
  }
  const partial = Object.keys(KNOWLEDGE_BASE).find(
    (entry) => key.includes(entry) || entry.includes(key),
  );
  if (partial) {
    return KNOWLEDGE_BASE[partial]!;
  }
  return `No knowledge-base entry for "${topic}". Known topics: ${Object.keys(KNOWLEDGE_BASE).join(", ")}.`;
}

/** Look up a fact about the ADL framework from the in-memory knowledge base. */
export const lookupFact = tool({
  description:
    "Look up a fact about the Agent Dev Lab (ADL) framework. Use for questions about agents, workflows, the AI SDK, or memoryScope.",
  inputSchema: z.object({
    topic: z.string().describe("The topic to look up, e.g. 'workflow' or 'memoryScope'."),
  }),
  execute: async ({ topic }) => ({ topic, fact: lookup(topic) }),
});

/** Safely evaluate a basic arithmetic expression (+, -, *, /, parentheses). */
export const calculate = tool({
  description:
    "Evaluate a basic arithmetic expression with + - * / and parentheses. Use for any math in the question.",
  inputSchema: z.object({
    expression: z.string().describe("An arithmetic expression, e.g. '128 * 12 + 7'."),
  }),
  execute: async ({ expression }) => {
    try {
      return { expression, result: evaluateExpression(expression) };
    } catch (error) {
      return { expression, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

export const knowledgeTools = { lookupFact, calculate };

/**
 * Recursive-descent evaluator for `+ - * /` and parentheses with decimals and unary
 * minus. Intentionally avoids `eval`/`Function` so untrusted model output cannot run
 * arbitrary code.
 */
export function evaluateExpression(input: string): number {
  let pos = 0;
  const src = input;

  function skipWhitespace(): void {
    while (pos < src.length && src[pos] === " ") pos++;
  }

  function parseExpression(): number {
    let value = parseTerm();
    skipWhitespace();
    while (src[pos] === "+" || src[pos] === "-") {
      const op = src[pos++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
      skipWhitespace();
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    skipWhitespace();
    while (src[pos] === "*" || src[pos] === "/") {
      const op = src[pos++];
      const rhs = parseFactor();
      if (op === "/" && rhs === 0) {
        throw new Error("Division by zero");
      }
      value = op === "*" ? value * rhs : value / rhs;
      skipWhitespace();
    }
    return value;
  }

  function parseFactor(): number {
    skipWhitespace();
    if (src[pos] === "+" || src[pos] === "-") {
      const op = src[pos++];
      const operand = parseFactor();
      return op === "-" ? -operand : operand;
    }
    if (src[pos] === "(") {
      pos++;
      const value = parseExpression();
      skipWhitespace();
      if (src[pos] !== ")") {
        throw new Error("Missing closing parenthesis");
      }
      pos++;
      return value;
    }
    return parseNumber();
  }

  function parseNumber(): number {
    skipWhitespace();
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos]!)) pos++;
    if (pos === start) {
      throw new Error(`Unexpected token at position ${pos}`);
    }
    const value = Number(src.slice(start, pos));
    if (Number.isNaN(value)) {
      throw new Error(`Invalid number: ${src.slice(start, pos)}`);
    }
    return value;
  }

  const result = parseExpression();
  skipWhitespace();
  if (pos !== src.length) {
    throw new Error(`Unexpected token "${src[pos]}" at position ${pos}`);
  }
  return result;
}
