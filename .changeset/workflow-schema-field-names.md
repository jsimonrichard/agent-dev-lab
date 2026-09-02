---
"@agent-dev-lab/core": patch
"@agent-dev-lab/cli": patch
---

Rename `WorkflowDefinition`/`Workflow`'s `input`/`output` fields to `inputSchema`/`outputSchema`, matching `AgentDefinition.outputSchema`'s naming — these hold a Zod *schema*, not the input/output value itself. **Breaking** for any `adl.config.ts` workflow passing `input`/`output` directly (`adl.createWorkflow({ input: ..., output: ... })` → `{ inputSchema: ..., outputSchema: ... }`); `Workflow.input` (the resolved schema getter, e.g. from `project.getWorkflow(id)`) is now `Workflow.inputSchema`. The CLI scaffold (`adl init`) already uses the new names.
