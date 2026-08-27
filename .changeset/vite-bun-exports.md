---
"@agent-dev-lab/web": patch
---

Honor the `bun` export condition when Vite SSR-imports `@agent-dev-lab/core`, so the dashboard loads TypeScript source instead of a stale `dist` build.
