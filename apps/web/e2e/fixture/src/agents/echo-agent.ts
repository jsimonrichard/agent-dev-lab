import { adl } from "../adl";
import { delayedEchoStream, fixtureMockModel } from "../mock-streams";

export const echoAgent = adl.createAgent({
  id: "echo-agent",
  systemPrompt: "You stream a fixed delayed echo. Ignore the user text.",
  model: fixtureMockModel(async () => delayedEchoStream()),
});
