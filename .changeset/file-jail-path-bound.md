---
"@agent-dev-lab/tools": patch
---

File jail is allow/deny-only (`cwd` is a relative-path base, default home). File tools gain `denyWrite`; `describeFileEnv` reports `allowWrite` and `denyWrite`. Workspace forwards bash `denyWrite`.
