---
"@agent-dev-lab/core": minor
"@agent-dev-lab/web": minor
---

Add project hot reload for dev: `LoadedAdlProject.reload()` and `watchAdlProject()` re-import agents, workflows, and templates while pinning stores. File-backed prompt templates re-read from disk on each render only when `ADL_PROJECT_WATCH=1` (inspection UI dev). Production serve and CLI runs cache prompt text at template creation. The inspection UI watches the project tree and refreshes catalog metadata over SSE.
