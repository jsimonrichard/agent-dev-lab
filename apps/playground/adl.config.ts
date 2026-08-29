import type { AdlProjectConfig, Agent, ToolSet } from "@agent-dev-lab/core";

import { adl } from "#adl";

import { drafter, editor, outliner, researchAssistant, reviser, writer } from "./src/agents";
import { critic } from "./src/agents/critic";
import { researcher } from "./src/agents/researcher";
import { promptTemplates } from "./src/prompts";
import { answerQuestion } from "./src/workflows/answer-question";
import { demoCounter } from "./src/workflows/demo-counter";
import { literatureReview } from "./src/workflows/literature-review";
import { sharedScope } from "./src/workflows/shared-scope";
import { writeArticle } from "./src/workflows/write-article";

// Agents with a concrete `tools` shape are invariant in `Tools`, so widen to the
// registry's `Agent<unknown, ToolSet, unknown>` element type for the config array.
const agents: Agent<unknown, ToolSet, unknown>[] = [
  outliner,
  writer,
  editor,
  drafter,
  reviser,
  researchAssistant as unknown as Agent<unknown, ToolSet, unknown>,
  researcher,
  critic,
];

/**
 * Monorepo dev target for the inspection UI and CLI.
 * Registry arrays hold full agent/workflow/template objects; runtime is referenced via `adl`.
 */
export { adl };

export default {
  name: "playground",
  adl,
  agents,
  workflows: [demoCounter, writeArticle, answerQuestion, literatureReview, sharedScope],
  templates: promptTemplates,
} satisfies AdlProjectConfig;
