---
"@agent-dev-lab/web": patch
---

Fix false 404s on workflow-linked conversation scopes. Session hydration no longer latches “done” before episode registration, so concurrent loaders can resolve `${workflowRunId}:suffix` (and nested) scopes that exist only as episodes. Decode `%3A` in agent location paths.
