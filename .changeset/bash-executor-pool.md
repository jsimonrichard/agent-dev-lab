---
"@agent-dev-lab/tools": patch
---

Process-scoped bash executor pool keyed by project root, backend, and sandbox policy (including `allowEnv`). Same policy reuses one supervisor; providers release on `dispose()`. Omitted `allowEnv` inherits no host variables; pass `true` or a name/glob/`RegExp` allowlist.
