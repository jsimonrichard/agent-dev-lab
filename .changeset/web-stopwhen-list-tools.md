---
"@agent-dev-lab/web": patch
---

Fix the agent settings panel for jiti-loaded definitions: `stopWhen` is labeled "default" vs "custom" by reading `agent.definition.stopWhen` (undefined means default) instead of comparing the resolved `agent.stopWhen` getter by reference to this app's `DEFAULT_AGENT_STOP_WHEN`. Cross-realm module identity meant that comparison was never `===`, so every agent that never set a custom `stopWhen` showed as "custom."

The same panel lists a `ToolProvider`'s tools via `listTools()` rather than treating `getTools` / `contextSchema` as tool names. A provider with no `listTools` yields an empty list — not a fabricated `getTools` context.
