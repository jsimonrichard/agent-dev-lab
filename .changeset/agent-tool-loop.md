---
"@agent-dev-lab/core": minor
"@agent-dev-lab/web": minor
---

Fix standalone agent chats stopping after a tool call. The inspection UI now re-runs the agent on the same memoryScope until the model replies with no further tools (`runAgentUntilIdle`); each `agent.run()` remains a single AI SDK step.
