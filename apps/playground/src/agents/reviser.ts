import { adl } from "#adl";

import { model } from "../model";

/**
 * Different identity from {@link drafter}. The `shared-scope` workflow reuses
 * the drafter's `memoryScope` so this agent's prompt conflicts with the pin.
 */
export const reviser = adl.createAgent({
  id: "reviser",
  systemPrompt: "You are a reviser. Tighten wording; do not change meaning.",
  model,
});
