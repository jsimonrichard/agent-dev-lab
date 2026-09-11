---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

SQLite and the public store/event types now treat conversation metadata and agent episodes as first-class, not inspection-UI private tables. **Breaking** for anything that queried the old names or imported `sqliteInspectorSessionStore`: `adl_inspector_sessions` → `adl_conversation_metadata` (TS: `sqliteConversationMetadataStore`, `ConversationMetadataRecord`); `adl_workflow_events` → `adl_run_events`. Existing local databases are renamed in place on open.

New: `adl_agent_episodes` (projected from `agent_started` / `agent_finished` / `agent_failed`; `WorkflowStore.listAgentEpisodes`), `conversation_forked` (`RunEvent` + `AdlRuntime.recordConversationForked`, projected into `fork_json`), `adl_schema_migrations` (ledger for one-time backfills). `listEvents` accepts `{ memoryScope }` for conversation-scoped events that have no owning run. `agent_call_id` on conversation metadata is nullable — a fork exists before its first episode, so the UI no longer invents a `pending:<scope>` sentinel. The inspection UI hydrates chats from this store and records forks through the runtime rather than writing the table itself.

`adl_agent_episodes.model_id` / `model_provider` are nullable placeholders until Lane E lands `AgentRunInput.model`.
