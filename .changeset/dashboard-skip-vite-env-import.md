---
"@agent-dev-lab/web": patch
---

Stop Vite-importing a project's `src/env.ts` over `file://`, which fails when the project sits outside the inspection UI workspace. Dashboard env loading goes through `loadAdlProject` instead.
