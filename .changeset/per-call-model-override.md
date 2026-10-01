---
"@agent-dev-lab/core": minor
---

Add per-call `AgentRunInput.model` (`input.model ?? definition.model ?? defaults.model`) and record a read-only `{ modelId, provider }` descriptor on `agent_started` / agent episode projections.
