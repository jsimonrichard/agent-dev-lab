# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@agent-dev-lab/core`, `@agent-dev-lab/cli`, and `@agent-dev-lab/web`.

```bash
bun run changeset
bun run version-packages
bun run publish:packages
```

`publish:packages` builds the workspace (including the inspection UI) then runs `changeset publish`. Requires npm access to the `agent-dev-lab` org.
