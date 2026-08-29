---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add project hot reload for dev: `LoadedAdlProject.reload()` and `watchAdlProject()` re-import agents, workflows, and templates while pinning stores. File-backed prompt templates re-read from disk on each render when `ADL_PROJECT_WATCH=1`. The inspection UI refreshes catalog metadata over SSE.
