import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdlProject, type RunEvent } from "@agent-dev-lab/core";

import { hasOpenAiKey, DEFAULT_MODEL_ID } from "./model";

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = await loadAdlProject({ root: playgroundRoot });

console.log(`\n[playground] ADL project "${project.config.name}" at ${project.root}`);
console.log(`  agents:    ${project.listAgentIds().join(", ") || "(none)"}`);
console.log(`  workflows: ${project.listWorkflowIds().join(", ") || "(none)"}`);
console.log(`  templates: ${project.listTemplateNames().join(", ") || "(none)"}`);

const requested = process.argv[2];
const llmDefault = "answer-question";
const targetId = requested ?? (hasOpenAiKey() ? llmDefault : "demo-counter");

if (!requested && !hasOpenAiKey()) {
  console.log(
    "\n[playground] OPENAI_API_KEY is not set — running the no-LLM 'demo-counter' workflow.",
  );
  console.log(
    "  Set OPENAI_API_KEY (model: " +
      `${DEFAULT_MODEL_ID}) and run e.g. \`bun run start write-article\` or \`bun run start answer-question\`.`,
  );
}

const workflow = project.getWorkflow(targetId);
if (!workflow) {
  console.error(`\n[playground] Unknown workflow "${targetId}".`);
  process.exit(1);
}

console.log(`\n[playground] Running workflow "${targetId}"...\n`);

function formatEvent(event: RunEvent): string | null {
  const indent = "path" in event ? "  ".repeat(event.path.length) : "";
  switch (event.type) {
    case "workflow_started":
      return `▶ workflow ${event.workflowId}`;
    case "step_started":
      return `${indent}┌ step ${event.name}${event.key ? `[${event.key}]` : ""}`;
    case "step_finished":
      return `${indent}└ step ${event.name}${event.key ? `[${event.key}]` : ""} ✓ (${event.durationMs}ms)`;
    case "step_skipped":
      return `${indent}· step ${event.name} (cached)`;
    case "step_failed":
      return `${indent}✗ step ${event.name} failed`;
    case "agent_started":
      return `${indent}  ↳ agent ${event.agentId} started`;
    case "agent_finished":
      return `${indent}  ↳ agent ${event.agentId} finished`;
    case "agent_failed":
      return `${indent}  ↳ agent ${event.agentId} FAILED: ${String(event.error)}`;
    case "custom":
      return `${indent}• ${event.name} ${JSON.stringify(event.payload)}`;
    case "workflow_finished":
      return `✔ workflow finished`;
    case "workflow_failed":
      return `✘ workflow failed: ${String(event.error)}`;
    default:
      return null;
  }
}

const handle = workflow.stream({});

(async () => {
  for await (const event of handle.events) {
    const line = formatEvent(event);
    if (line) {
      console.log(line);
    }
  }
})().catch(() => {
  /* event stream closes when the run settles */
});

try {
  const output = await handle.result;
  console.log("\n[playground] Output:\n");
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error("\n[playground] Workflow run failed:");
  console.error(error instanceof Error ? error.message : error);
  if (!hasOpenAiKey()) {
    console.error("\nThis demo needs OPENAI_API_KEY for agent execution.");
  }
  process.exit(1);
}
