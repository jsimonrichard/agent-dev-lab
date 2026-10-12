---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add `abandonLiveRunsLostOnRestart`. The inspection UI calls it at boot so runs left `running` by a previous process are marked failed with a visible reason instead of appearing live forever.
