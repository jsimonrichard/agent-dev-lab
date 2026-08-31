# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@agent-dev-lab/core`, `@agent-dev-lab/cli`, and `@agent-dev-lab/web`. `@agent-dev-lab/docs` and `@agent-dev-lab/playground` are ignored.

```bash
bun run changeset
bun run version-packages
bun run publish:packages
```

## GitHub Release workflow

Pushes to `main` run [`.github/workflows/release.yml`](../.github/workflows/release.yml) (same pattern as [ProseMark](https://github.com/jsimonrichard/ProseMark/blob/main/.github/workflows/release.yml)):

1. If unpublished changeset files exist, [changesets/action](https://github.com/changesets/action) opens a **Version Packages** PR (`bun run version` → `changeset version` + `bun install` so `bun.lock` matches).
2. Merging that PR publishes `@agent-dev-lab/core`, `@agent-dev-lab/cli`, and `@agent-dev-lab/web` with `bun run ci:publish` (build those three, then `changeset publish`).

`workflow_dispatch` can rerun publish from `main` without a new commit. The job uses the **Production** environment and npm **OIDC** trusted publishing (`id-token: write`). Configure the `agent-dev-lab` org on npm as a trusted publisher for this repo/workflow; no `NPM_TOKEN` is required.

Local `publish:packages` still works if you have npm access to the org.
