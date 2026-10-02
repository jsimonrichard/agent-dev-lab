import type { AdlProjectConfig, AnyAgent } from "@agent-dev-lab/core";

import { adl } from "#adl";

import {
  drafter,
  editor,
  factKeeper,
  outliner,
  researchAssistant,
  reviser,
  sandboxAgent,
  sandboxAgentNative,
  writer,
} from "./src/agents";
import { critic } from "./src/agents/critic";
import { researcher } from "./src/agents/researcher";
import { createDefaultModel, createGpt4oMiniModel } from "./src/model";
import { promptTemplates } from "./src/prompts";
import { answerQuestion } from "./src/workflows/answer-question";
import { copyMemory } from "./src/workflows/copy-memory";
import { demoCounter } from "./src/workflows/demo-counter";
import { fetchUrlDemo } from "./src/workflows/fetch-url-demo";
import { literatureReview } from "./src/workflows/literature-review";
import { nestLeafAlpha, nestLeafBeta, nestPhase, nestedDemo } from "./src/workflows/nested-demo";
import { sandboxDemo } from "./src/workflows/sandbox-demo";
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
  factKeeper,
  reviser,
  researchAssistant,
  researcher,
  critic,
  sandboxAgent,
  sandboxAgentNative,
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
  models: [
    {
      id: "default",
      label: "Default (ADL_MODEL)",
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      factory: createDefaultModel,
    },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      factory: createGpt4oMiniModel,
    },
  ],
  workflows: [
    demoCounter,
    nestedDemo,
    nestPhase,
    nestLeafAlpha,
    nestLeafBeta,
    writeArticle,
    answerQuestion,
    literatureReview,
    sharedScope,
    copyMemory,
    sandboxDemo,
    fetchUrlDemo,
  ],
  templates: promptTemplates,
} satisfies AdlProjectConfig;
