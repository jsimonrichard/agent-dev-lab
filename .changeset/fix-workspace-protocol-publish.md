---
"@agent-dev-lab/core": patch
"@agent-dev-lab/cli": patch
"@agent-dev-lab/web": patch
---

Fix `workspace:*` dependency ranges being published unresolved (e.g. `"@agent-dev-lab/core": "workspace:*"` in the published `@agent-dev-lab/cli` and `@agent-dev-lab/web` manifests), which broke installing these packages outside the monorepo. `changeset publish` only rewrites explicit workspace ranges (e.g. `workspace:^1.2.0`), not bare aliases like `workspace:*`, and plain `npm publish` has no concept of the `workspace:` protocol at all.

Publishing now packs each package with `bun pm pack`, which resolves workspace protocol ranges to the real published version before handing the tarball to `npm publish`.
