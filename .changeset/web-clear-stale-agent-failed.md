---
"@agent-dev-lab/web": patch
---

Clear the standalone chat `agent_failed` banner when a later turn succeeds, instead of keeping the prior call's error after `latestAgentCallId` moves on.
