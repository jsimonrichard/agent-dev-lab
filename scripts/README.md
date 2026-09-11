# Root scripts

Build and release helpers. These are **not** Bun test files except `*.test.ts`.

| Script          | Role                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-publish.sh` | Per-package publish: strip `devDependencies`, `bun pm pack`, `npm publish`. Invoked as each package's `ci:publish`.                                                          |
| `patch-lock.ts` | Rewrite `bun.lock` workspace `version` fields from each `package.json` after `changeset version`.                                                                            |
| `pack-local.ts` | Isolated local pack of core/web/cli/tools as versionless tarballs, with attached consumer projects via `vendor/` symlinks. Does not publish. Restores version bumps on exit. |

## `pack:local`

Packs into `.data/packed-e2e/tarballs/` using **stable filenames** (`agent-dev-lab-core.tgz`, …). `--project` scaffolds if needed, points `vendor/` at that directory (symlink), and records the project under `.data/packed-e2e/attached/<name>`. A later `pack:local` overwrites the tarballs and refreshes every attached project — no re-scaffold.

```bash
# Attach a project (once)
bun run pack:local -- --project /tmp/adl-e2e

# Rebuild tarballs; attached projects pick them up
bun run pack:local

# Upgrade-shaped fixture: scaffold with a published CLI, then attach
bun run pack:local -- --from-published @agent-dev-lab/cli@0.0.5 --project /tmp/adl-upgrade
```

`--force` replaces a `vendor/` that is a real directory (or a symlink to the wrong place). `--skip-build` / `--skip-install` skip the slow steps on a rerun. `--skip-install` still rewrites the vendor symlink and `file:` specs; `node_modules` stays stale until you install.

If an attached `bun.lock` still names versioned tarballs that the symlink no longer has (the pre-stable-name layout), that lockfile is deleted before `bun install` so Bun does not ENOENT on extract.

Not in scope: seeding SQLite, porting playground workflows, or the 0.0.3 `input` → `inputSchema` rewrite (those stay in a fixture repo).
