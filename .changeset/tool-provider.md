---
"@agent-dev-lab/core": patch
---

Add `ToolProvider` (`{ getTools(ctx) }`) so tools can depend on runtime context. `AgentDefinition.tools` and `AgentRunInput.tools` accept a `ToolSet` or provider; `createToolProvider` wraps a function and `combineToolProviders` merges named sources with namespaced context. Optional `listTools()` and `contextSchema` are introspection-only.
