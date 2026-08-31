---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Fold the tool loop into `agent.run()` / `agent.stream()`. `text` / `output` are the final response; tool call and result events still emit.
