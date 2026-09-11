---
"@agent-dev-lab/tools": patch
---

Add the private `@agent-dev-lab/tools` package: sandboxed `readFile` / `writeFile` / `editFile` (`createFileTools`, `createFileToolProvider`, `createFileJail`) and `bash` (`createBashTool`, `createBashToolProvider`, native and ASRT executors), plus `createWorkspaceToolProvider` to combine them. Dangerous tools take their jail/executor as a required argument — there is no zero-config unsafe default. The package stays `private: true` (not published). `fetchUrl` and `grep`/`glob` are in `fetch-url.md` and `grep-glob-search-tools.md`.
