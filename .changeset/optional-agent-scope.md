---
"@agent-dev-lab/core": patch
---

Allow `agent.run` / `agent.stream` without a `memoryScope` (random id allocated) and emit warnings when another agent’s system prompt differs from the pin on a shared scope.
