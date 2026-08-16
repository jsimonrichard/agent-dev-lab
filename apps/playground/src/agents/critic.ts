import { adl } from "#adl";

/** Second sample agent so a single step can host two selectable episodes. */
export const critic = adl.createAgent({
  id: "critic",
  instructions:
    "You are a skeptical reviewer. List 2–3 open questions or gaps about the user's topic. Be concise. Do not invent citations.",
});
