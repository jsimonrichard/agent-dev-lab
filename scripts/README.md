# Root scripts

Build and release helpers. These are **not** Bun test files except `*.test.ts`.

| Script          | Role                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-publish.sh` | Per-package publish: strip `devDependencies`, `bun pm pack`, `npm publish`. Invoked as each package's `ci:publish`.                                           |
| `patch-lock.ts` | Rewrite `bun.lock` workspace `version` fields from each `package.json` after `changeset version`.                                                             |
| `pack-local.ts` | Isolated local pack of core/web/cli/tools as `*-e2e.0` tarballs, optionally scaffolding a consumer project. Does not publish. Restores version bumps on exit. |

## `pack:local`

Automates the temporary prerelease-pack flow (jj change `nlttyxmo`) without leaving `package.json` / `bun.lock` dirty:

```bash
# Tarballs only → .data/packed-e2e/
bun run pack:local

# Pack + `adl init` + point the project at `vendor/` copies of the tarballs
bun run pack:local -- --project /tmp/adl-e2e

# Upgrade-shaped fixture: scaffold with a published CLI, then swap onto packed tarballs
bun run pack:local -- --from-published @agent-dev-lab/cli@0.0.5 --project /tmp/adl-upgrade
```

`--force` overwrites existing tarballs or re-points an existing ADL project. `--skip-build` / `--skip-install` skip the slow steps on a rerun.

Not in scope: seeding SQLite, porting playground workflows, or the 0.0.3 `input` → `inputSchema` rewrite (those stay in a fixture repo).
