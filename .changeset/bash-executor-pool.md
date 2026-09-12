---
"@agent-dev-lab/tools": patch
---

Process-scoped bash executor pool keyed by project root, backend, and sandbox policy (including `allowEnv`). Same policy reuses one supervisor; providers release on `dispose()`. Default sandbox env is empty (`allowEnv` omitted); pass `true` or a name/glob/`RegExp` allowlist to expose host variables.
