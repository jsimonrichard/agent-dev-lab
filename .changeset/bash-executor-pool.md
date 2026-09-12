---
"@agent-dev-lab/tools": patch
---

Process-scoped bash executor pool keyed by project root, backend, and sandbox policy. Same policy reuses one supervisor; providers release on `dispose()`.
