# Plan: supply `toolProviderContext` from CLI and dashboard

**Status:** Superseded for persistence. CLI + dashboard supply (sections 1–2)
landed. Episode snapshots, inspector agent default, and next-turn draft seeding
are implemented under the separate plan `persist_tool_context` (2026-09-14) —
not as a conversation-metadata next-turn column.
Last reconciled: **2026-09-14**.

## Goal

Let a user who calls an agent **directly** (`adl agent run`, inspection-UI
conversation) pass `toolProviderContext`, so a `ToolProvider` that requires
context (e.g. `{ projectPath }`) is usable outside a workflow.

## Principles

- The framework still never parses or validates `toolProviderContext`. Hosts
  pass the raw value through to `agent.run`.
- No cwd / project-root default. Omitting context stays `undefined`.
- Reuse the workflow-input Zod walk (`describeWorkflowInput` /
  `buildWorkflowInput`) for the dashboard form. Nested / union fields stay
  `kind: "json"`.
- Hosts never branch on which provider they are talking to — only on
  `isToolProvider` / `contextSchema`.
- One concern per changeset.

## Reuse survey

| Slice     | Existing modules                                                                                              | Action                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CLI       | `apps/cli/src/commands/agent/run/{command,impl}.ts`, workflow `--input` JSON parse, `isToolProvider`          | Extend. Same JSON-parse error as `adl workflow run`. Pass through to `agent.run`.            |
| Dashboard | `describeWorkflowInput` / `StartWorkflowForm` controls, `inspectAgentTools`, `startAgentTurn`, settings panel | Extend inspector meta with schema fields; render a form; send context on `sendAgentMessage`. |
| Core      | `AgentRunInput.toolProviderContext`, `ToolProvider.contextSchema`, `ConversationMetadataRecord`               | No core change in these slices. Persistence is the next independent step.                    |

## Numbered work sections

1. **CLI** — `adl agent run --tool-context '<json>'` (`-c`). `adl agent list`
   suffixes `(tool-context)` when `agent.tools` is a `ToolProvider`. Docs.
2. **Dashboard** — inspector meta from `contextSchema`; editable form on a
   standalone conversation; `startAgentTurn` forwards the raw value. Docs.
3. **Remember (later)** — ~~persist resolved context on conversation metadata~~
   **Done differently:** per-episode snapshot in core + inspector-only agent
   default + UI next-turn draft (see `persist_tool_context` plan).

## Out of scope

- Persisting `toolProviderContext` on `ConversationMetadataRecord` / forks.
- Framework-side parsing of `contextSchema`.
- Defaulting context to cwd or `projectRoot`.
- Changing `createWorkflowFromAgent` (already a workflow-shaped `run`).

## Success criteria

1. `adl agent run coding-agent --input "say hi" --tool-context '{"projectPath":"/tmp/crate"}'`
   reaches `getTools` with that object, not `undefined`.
2. Malformed `--tool-context` fails with `INVALID_INPUT`, same as workflow
   `--input`.
3. `adl agent list` shows which registered agents use a `ToolProvider`.
4. The inspection UI shows a form (or JSON field) for a ToolProvider agent and
   includes the value on `agent.run` for a standalone chat.
5. Agents without a ToolProvider are unchanged: no flag required, no form.
