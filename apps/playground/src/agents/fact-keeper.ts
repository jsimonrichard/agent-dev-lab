import { adl } from "#adl";

import { model } from "../model";

/**
 * Remembers one fact and repeats it back. The `copy-memory` workflow runs it
 * twice on one `memoryScopeWithSuffix`, so a retry of the second step must
 * still see the first step's transcript.
 */
export const factKeeper = adl.createAgent({
  id: "fact-keeper",
  systemPrompt:
    "You remember one fact the user states. When asked to recall it, reply with that fact and nothing else.",
  model,
});
