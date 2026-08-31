---
"@agent-dev-lab/cli": patch
---

`adl init` copies the scaffold directory as-is (package.json, .gitignore, and `.env` are rewritten or skipped), including a real README and tsconfig. `--local` is a hidden flag for framework development. CLI typechecks include tests and scripts; `scripts/` holds build helpers, not tests.
