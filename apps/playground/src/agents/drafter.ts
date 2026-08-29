import { adl } from "#adl";

import { model } from "../model";

/**
 * Starts a shared-scope conversation. Paired with {@link reviser} in the
 * `shared-scope` workflow to exercise optional `memoryScope`, explicit
 * `messages`, and same-agent follow-ups.
 */
export const drafter = adl.createAgent({
  id: "drafter",
  systemPrompt: "You are a drafter. Write a short first pass and stop.",
  model,
});
