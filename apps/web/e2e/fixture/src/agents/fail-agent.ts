import { MockLanguageModelV2 } from "ai/test";

import { adl } from "../adl";
import { FAIL_AGENT_MESSAGE } from "../replies";

/** Always fails at stream time so the UI can assert agent_failed surfacing. */
export const failAgent = adl.createAgent({
  id: "fail-agent",
  systemPrompt: "You always fail. Ignore the user text.",
  model: new MockLanguageModelV2({
    doStream: async () => {
      throw new Error(FAIL_AGENT_MESSAGE);
    },
  }),
});
