---
"@agent-dev-lab/tools": patch
---

Add `createMcpToolProvider`: wraps `@ai-sdk/mcp` (`^2`) as a ToolProvider with a required transport and EffectGate, process-scoped dispose, and fail-closed defaults. Every MCP tool call records an effect intent and goes through the gate.
