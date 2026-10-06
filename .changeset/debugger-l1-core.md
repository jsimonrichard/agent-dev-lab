---
"@agent-dev-lab/core": patch
---

Add an in-process SuspendStore, runtime debugger session, and step-enter effect intents so pause/continue/step share the gate with approvals. Suspend records do not survive process restart (persistence is a follow-up).
