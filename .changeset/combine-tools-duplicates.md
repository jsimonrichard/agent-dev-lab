---
"@agent-dev-lab/core": patch
---

**Breaking:** `combineToolProviders` throws `INVALID_CONFIG` when two sources provide the same tool name. In 0.0.6 the later source silently replaced the earlier tool, so for example an MCP server could shadow a built-in. Rename or filter one of the tools. Per-call `tools` still override definition tools on `agent.run`.
