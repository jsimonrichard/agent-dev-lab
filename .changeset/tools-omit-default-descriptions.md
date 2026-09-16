---
"@agent-dev-lab/tools": patch
---

Schema help on `cwd`/`root`, `allowWrite`, `allowRead`, and `tmpDir` states the runtime omit-default, which cannot be a Zod `.default()` because it depends on the sandbox working directory.
