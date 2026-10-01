## Goal

Add an MCP client `ToolProvider` in `@agent-dev-lab/tools` that wraps `@ai-sdk/mcp` `createMCPClient` into a `ToolSet`, with the same no-unsafe-default posture as bash (required config; fail closed on unclear trust).

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Prefer AI SDK MCP client APIs; do not hand-roll JSON-RPC.
2. Implement a `ToolProvider` factory with required connection/auth arguments (no ambient "connect to anything" default).
3. Lifecycle: dispose / `onRunEnd` as appropriate for client shutdown (reuse existing provider hooks).
4. Tests with a mock or local fixture server; document trust boundary in package README/JSDoc.
5. Changeset for `@agent-dev-lab/tools`.

## Out of scope

- Approval dispatcher wiring (Lane E) beyond leaving a clear hook point.
- Building a second web-search tool.
- Core package changes unless a tiny type export is required.
- Inspector UI for MCP server management.

## Success criteria

1. A project can register MCP tools via the provider and an agent can call them in tests.
2. Missing required trust/connection config throws or returns a typed error — no silent open client.
3. `.claude/gate.sh full` green (`test:node` if spawn/process involved).

## Constraints

- Same jail/approval philosophy as file/bash: dangerous capability = required argument.
- Do not nest a second MCP stack if the AI SDK already exposes the client.

## Handoff notes

Parent plan lane map D. Roadmap §2; [`tool-sandboxing.md`](../tool-sandboxing.md).

Reuse: `ToolProvider`, `dispose?` / `onRunEnd?`, existing tools package layout.
