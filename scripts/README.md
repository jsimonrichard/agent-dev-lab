# Root scripts

Build and release helpers. These are **not** Bun test files except `*.test.ts`.

| Script                           | Role                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-publish.sh`                  | Per-package publish: strip `devDependencies`, `bun pm pack`, `npm publish` with dist-tag resolution. Invoked as each package's `ci:publish`.                                 |
| `npm-dist-tag.ts`                | Resolve npm `--tag`: `NPM_DIST_TAG` override, else prerelease preid (`0.0.7-rc.1` → `rc`), else omit (stable → `latest`). Refuses prerelease + `latest`.                     |
| `require-prerelease-versions.ts` | Fail closed before Publish RC: all of core/tools/cli/web must already be semver prereleases.                                                                                 |
| `ci-install-jj.sh`               | Pin and install the Linux musl `jj` used by `packages/core` version-tag tests. Invoked from `.github/workflows/ci.yml`.                                                      |
| `patch-lock.ts`                  | Rewrite `bun.lock` workspace `version` fields from each `package.json` after `changeset version`.                                                                            |
| `pack-local.ts`                  | Isolated local pack of core/web/cli/tools as versionless tarballs, with attached consumer projects via `vendor/` symlinks. Does not publish. Restores version bumps on exit. |

## Registry release candidates vs `pack:local`

| Path               | Audience                            | How                                                                                                  |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **npm RC** (`@rc`) | External projects / sibling repos   | Changesets `pre` mode → version bump → Publish RC workflow (or `NPM_DIST_TAG=rc bun run ci:publish`) |
| **`pack:local`**   | In-repo e2e / local vendor symlinks | Tarballs under `.data/packed-e2e/`; never hits the registry                                          |

Consumers install registry RCs with no `file:` paths:

```bash
npm install @agent-dev-lab/core@rc
# or pin:
npm install @agent-dev-lab/core@0.0.7-rc.1
```

### Maintainer flow (Changesets `pre`)

1. From a clean checkout of the commit to RC (often `main` tip):
   ```bash
   bunx changeset pre enter rc   # writes .changeset/pre.json
   # ensure .changeset/*.md exist for packages that should bump
   bun run version               # e.g. 0.0.7-rc.0 + patch-lock
   ```
2. Land the version bump + `.changeset/pre.json` on a branch / merge to the ref you will publish.
3. Publish with dist-tag `rc` (does **not** move `latest`):
   - GitHub Actions → **Publish RC** → confirm `publish-rc`, set `ref` to that commit; or
   - Locally (OIDC/npm auth as today): `NPM_DIST_TAG=rc bun run ci:publish` (tag also inferred from `-rc.*` versions).
4. Before the next **stable** Version Packages on `main`:
   ```bash
   bunx changeset pre exit
   ```
   Commit the exit (remove/update `.changeset/pre.json`). Do not leave `pre` mode on `main` after a stable intent.

Stable releases stay on `.github/workflows/release.yml` (push/`workflow_dispatch` on `main` → Changesets version PR or publish `latest`).

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
