---
"@agent-dev-lab/cli": patch
---

Fix `adl init` generating an uninstallable `package.json` whenever `@agent-dev-lab/cli` ships a patch that `@agent-dev-lab/core` and `@agent-dev-lab/web` don't (e.g. this release): the scaffold pinned `@agent-dev-lab/core` and `@agent-dev-lab/web` to cli's own version instead of the versions cli actually depends on, so `bun install` / `npm install` failed to resolve them once the versions diverged. `adl init` now reads core/web's pinned versions from the CLI's own `dependencies` (falling back to cli's version only in a source checkout, where those are still `workspace:*`).
