---
"@agent-dev-lab/tools": patch
---

File jail is allow/deny-only (`cwd` is a relative-path base, default home). Shared `PathBound` / `checkPathAccess` in `fs-bounds`. File tools gain `denyWrite`; `describeFileEnv` reports `allowWrite` and `denyWrite`. Workspace passes bash `denyWrite` into file tools.
