---
"@agent-dev-lab/core": patch
"@agent-dev-lab/cli": patch
---

Rename workflow `input`/`output` to `inputSchema`/`outputSchema` (**breaking**). Update `adl.createWorkflow({ input, output })` to `{ inputSchema, outputSchema }`.
