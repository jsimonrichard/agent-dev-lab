---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Fold the tool loop into `agent.run()` / `agent.stream()`. Configure stop policy with `endWhen` (named policy or a `{ messages, oldMessages, newMessages }` predicate). Default `"ends-with-text"`; `"api-call-ends"` for one model call. `text` / `output` are the final response; tool call and result events still emit.
