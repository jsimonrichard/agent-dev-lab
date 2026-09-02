import type { AdlProjectConfig, AnyAgent } from "@agent-dev-lab/core";

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

// `AdlProjectConfig.agents` wants `AnyAgent[]` (`Agent<any, any, any>[]`). Each agent below is
// concretely typed (its own `ToolProviderContext`/`Tools`/`TOutput`), but `any` in every slot
// means the assignment just works — no cast needed, unlike the old `Agent<unknown, ToolSet,
// unknown>[]` registry shape, where `Tools`/`ToolProviderContext` sit in positions variant
// enough that a concrete agent never structurally satisfied it on its own.
const agents: AnyAgent[] = [
  outliner,
  writer,
  editor,
  drafter,
  reviser,
  researchAssistant,
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
