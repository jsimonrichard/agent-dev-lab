---
"@agent-dev-lab/web": patch
"@agent-dev-lab/cli": patch
"@agent-dev-lab/core": patch
---

Packed `adl dashboard` watches the project registry (published `@agent-dev-lab/web` is Nitro `.output` only). `--serve` is the watch opt-out (`ADL_PROJECT_WATCH=0`) and no longer selects the UI process. Vite is used when the web package still has its source tree; `--prebuilt` forces Nitro in the monorepo. `.env*` edits still need a restart.
