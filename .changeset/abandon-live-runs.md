---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add `abandonLiveRunsLostOnRestart`. The inspection UI calls it at boot so runs and agent episodes left `running` or `suspended` by a process that has exited are marked failed with a visible reason instead of appearing live forever. `workflow_started` and `agent_started` now record an `owner` (`RunOwner`: pid, hostname, per-process id). Live rows owned by another process still alive on this host, or by a process on another host, are left live and listed in `leftLive`. Rows recorded before owners existed are treated as abandoned.
