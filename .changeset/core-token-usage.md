---
"@agent-dev-lab/core": patch
---

Capture provider-reported token totals from `streamText.totalUsage` on `agent_finished` (and `AgentRunResult`), and project them onto `adl_agent_episodes` / `AgentEpisodeSummary`. Usage is optional and additive — `EVENT_SCHEMA_VERSION` stays at 1. No dollar estimates yet.
