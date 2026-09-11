---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Conversation metadata and agent episodes are now first-class store types. **Breaking:** `adl_inspector_sessions` → `adl_conversation_metadata`, `adl_workflow_events` → `adl_run_events` (existing DBs renamed on open). Adds `adl_agent_episodes`, `conversation_forked`, and `listEvents({ memoryScope })`.
