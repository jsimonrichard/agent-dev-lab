---
"@agent-dev-lab/web": patch
---

Hold streamed assistant text until the transcript refresh lands after `agent_messages_committed`, and stop wiping the chat when only the tool-context draft seed changes — so the final reply after a tool loop stays visible without a reload.
