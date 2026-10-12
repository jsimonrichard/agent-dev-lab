---
"@agent-dev-lab/core": patch
"@agent-dev-lab/tools": patch
"@agent-dev-lab/web": patch
"@agent-dev-lab/cli": patch
---

**Breaking:** upgrade to Vercel AI SDK **v7** and make `ai` a peer of `@agent-dev-lab/core` (no longer a hard dependency).

### Consumer migration

1. Install peers in every host that runs agents:
   ```bash
   bun add ai@^7 @ai-sdk/otel@^1
   ```
2. Bump providers to v7-aligned majors (e.g. `@ai-sdk/openai@^4`). For MCP tools, use `@ai-sdk/mcp@^2`.
3. Replace removed AI SDK APIs if you used them directly: `CoreMessage` → `ModelMessage`; `streamText({ system })` → `instructions`; `experimental_telemetry` → `telemetry` (ADL registers `@ai-sdk/otel` from `createAdlRuntime` unless `telemetry: { isEnabled: false }`); `experimental_output` → `output`.
4. Tools no longer receive the `ToolProviderContext` through `experimental_context`; read it from the `ToolProvider.getTools(context)` closure instead. `telemetry.metadata` is forwarded as AI SDK `runtimeContext`.
5. `AgentRunResult.sdk` and `AgentStreamResult` now carry AI SDK v7 result types.
6. CLI `adl init` scaffolds now declare `ai`, `@ai-sdk/otel`, and `@ai-sdk/openai@^4`.
