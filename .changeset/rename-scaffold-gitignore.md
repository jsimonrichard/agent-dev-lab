---
"@agent-dev-lab/cli": patch
---

Fix `adl init` crashing when the CLI is installed from npm (e.g. via `bunx @agent-dev-lab/cli init` or `npx`). npm's packlist strips any file literally named `.gitignore` from published tarballs, so the packaged `dist/scaffold/.gitignore` was silently dropped from every published release, and `init` threw `ENOENT` trying to read it. The scaffold source now ships the file as `gitignore` (no leading dot) and `init` writes it out as `.gitignore` in the new project, same as before.
