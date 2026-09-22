---
"@agent-dev-lab/core": patch
---

`MessageStore.copy` copies a transcript onto an empty scope. A workflow step records each scope the runtime message store loads, saves, copies, or deletes (`memoryScopes` on the step record), via the workflow AsyncLocalStorage frame. Custom message stores must add `copy`.
