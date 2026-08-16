import { adl } from "#adl";

/** Sample agent for the inspection UI and `adl run` demos. */
export const researcher = adl.createAgent({
  id: "researcher",
  instructions:
    "You are a concise research assistant. Summarize the user's topic in a few sentences. Do not invent citations.",
});
