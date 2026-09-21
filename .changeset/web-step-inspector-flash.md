---
"@agent-dev-lab/web": patch
---

Fix the workflow step conversation inspector flashing "No conversation recorded." between streamed text and the stored transcript. Keep the last resolved message prefetch across loader refreshes, and hold streamed text until committed messages replace it after `agent_finished`.
