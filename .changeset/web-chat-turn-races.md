---
"@agent-dev-lab/web": patch
---

Fix standalone chat turn races: roll back optimistic messages on failed send, reseed tool context only on runId change, and clear held stream text when starting the next turn.
