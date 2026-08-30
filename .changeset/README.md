# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@agent-dev-lab/core`, `@agent-dev-lab/common`, `@agent-dev-lab/cli`, and `@agent-dev-lab/web`.

`@agent-dev-lab/common` is published because those packages depend on it. It is shared infrastructure (SQLite, logging, ESLint), not a user-facing SDK.

```bash
bun run changeset
bun run version-packages
bun run publish:packages
```

`publish:packages` builds the workspace (including the inspection UI) then runs `changeset publish`. Requires npm access to the `agent-dev-lab` org.
