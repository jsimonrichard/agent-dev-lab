---
"@agent-dev-lab/tools": patch
---

Add `createMcpToolProvider`: wraps `@ai-sdk/mcp` (`^2`) as a ToolProvider with a required `serverId`, transport, and EffectGate, process-scoped dispose, and fail-closed defaults. Every MCP tool call records an effect intent (`source: "mcp:<serverId>"`, id = the AI SDK `toolCallId`) and goes through the gate. Connecting, `initialize`, and each call are time-bounded (`initTimeoutMs`, `callTimeoutMs`), and results over `maxOutputBytes` are replaced by an error result. Also adds `decideToolCall`, the non-throwing form of `assertToolAllowed`.
