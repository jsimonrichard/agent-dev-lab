import { MockLanguageModelV2 } from "ai/test";

import { adl } from "../adl";
import { delayedEchoStream } from "../mock-streams";

export const echoAgent = adl.createAgent({
  id: "echo-agent",
  systemPrompt: "You stream a fixed delayed echo. Ignore the user text.",
  model: new MockLanguageModelV2({
    doStream: async () => delayedEchoStream(),
  }),
});
