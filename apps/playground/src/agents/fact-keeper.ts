import { adl } from "#adl";

import { model } from "../model";

/**
 * Remembers one fact and repeats it back. Used by the `copy-memory` workflow
 * on two scopes: the original transcript, then a `MessageStore.copy` of it.
 */
export const factKeeper = adl.createAgent({
  id: "fact-keeper",
  systemPrompt:
    "You remember one fact the user states. When asked to recall it, reply with that fact and nothing else.",
  model,
});
