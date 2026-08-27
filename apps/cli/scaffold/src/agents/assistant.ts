import { adl } from "#adl";

/** Sample chat agent for the inspection UI and the `ask` workflow. */
export const assistant = adl.createAgent({
  id: "assistant",
  systemPrompt: "You are a helpful assistant. Answer clearly and concisely.",
});
