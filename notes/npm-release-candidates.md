# npm release candidates (registry RCs)

**Status:** Implemented (2026-10-02). Script + Publish RC job in `release.yml` (OIDC-bound) + docs landed; live npm smoke deferred to maintainer OIDC (see Gaps). Sibling `release-rc.yml` was removed after E404 — npm trusted publishers only authorize `release.yml`.
**HANDOFF:** [`tsk-handoffs/adl-npm-release-candidates.md`](./tsk-handoffs/adl-npm-release-candidates.md)

---

## Goal

Publish **release-candidate** builds of `@agent-dev-lab/{core,tools,cli,web}` to the **npm registry** so external projects can depend on a real version string (e.g. `0.0.7-rc.1` or `@agent-dev-lab/core@rc`) instead of `file:` / relative path / `pack:local` vendor symlinks.

`pack:local` stays for in-repo e2e — it does not replace registry RCs.

---

## Principles

1. **Upstream before workaround** — use [Changesets prerelease mode](https://github.com/changesets/changesets/blob/main/docs/prereleases.md) (`changeset pre enter` / `pre exit`), not a parallel versioning scheme.
2. **Never pollute `latest`** — RC publishes use an explicit npm **dist-tag** (`rc`, optionally also installable as `@rc`). Stable Release workflow keeps owning `latest`.
3. **Reuse `scripts/ci-publish.sh`** — same `bun pm pack` → `npm publish` path (workspace:`*` resolution). Extend it to pass `--tag` when the version is a prerelease (or when `NPM_DIST_TAG` is set). Do not invent a second packer.
4. **One concern** — RC plumbing only; not the AI SDK upgrade or execution-control spine.
5. **Fail closed** — refuse to publish an RC with tag `latest`; refuse to leave the repo in `pre` mode on `main` after a mistaken stable intent without an explicit exit.

---

## Reuse survey

| Surface                           | Role today                                | Extend                                                                             |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `.changeset/` + `bun run version` | Stable bumps + `patch-lock.ts`            | `changeset pre enter rc` writes `.changeset/pre.json`; version script already fine |
| `.github/workflows/release.yml`   | On `main`: Version PR or publish `latest` | Add **manual** RC path (see § work) — do not auto-publish RCs on every main push   |
| `scripts/ci-publish.sh`           | Pack + `npm publish` tarball              | Add `--tag` when version matches semver prerelease **or** `NPM_DIST_TAG`           |
| `bun run pack:local`              | Local tarballs + `vendor/`                | **Unchanged** — local/e2e only; document “for registry consumers use `@rc`”        |
| OIDC / Production env             | Trusted publish                           | Same npm packages; RC is another version+tag on those packages                     |

---

## Consumer experience (success shape)

```bash
# After an RC is published:
npm install @agent-dev-lab/core@rc
# or pin:
npm install @agent-dev-lab/core@0.0.7-rc.1
```

Same for `tools` / `cli` / `web`. No `file:../agent-dev-lab/packages/core`.

---

## Numbered work

### 1. Publish script: dist-tag

In `scripts/ci-publish.sh`:

- If `NPM_DIST_TAG` is set, `npm publish … --tag "$NPM_DIST_TAG"`.
- Else if `VERSION` matches a semver prerelease (`-rc.`, `-canary.`, etc.), default tag to `rc` (or parse preid).
- Else omit `--tag` (npm default `latest`) — stable path unchanged.
- **Guard:** if tag would be `latest` and version is prerelease → throw / exit non-zero.

### 2. Documented maintainer flow (Changesets `pre`)

Preferred operator path (document in `scripts/README.md` + short AGENTS.md / human-validation pointer):

```bash
# From a clean checkout of the commit you want to RC (often main tip, or a release branch):
bunx changeset pre enter rc    # creates .changeset/pre.json
# ensure changesets exist for packages that should bump
bun run version                # bumps to e.g. 0.0.7-rc.0, patch-lock
# commit the version bump + pre.json (or let a Version PR do it — see §3)
NPM_DIST_TAG=rc bun run ci:publish   # or rely on tag inference from version
bunx changeset pre exit        # before returning to stable Version Packages on main
```

Exact commit/PR choreography is in §3 — pick one and delete the other.

### 3. CI entrypoint (choose one; prefer A)

**A — `workflow_dispatch` on Release (or a sibling `release-rc.yml`)**  
Inputs: confirm checkbox; optional git ref. Job: checkout ref → install → build:publish → typecheck:publish → with repo already in `pre` mode and version commits present **or** run `pre enter` + `version` in CI only if that is carefully gated. Simplest safe variant: **CI only publishes**; humans run `pre enter` + version PR, then dispatch “Publish RC”.

**B — Branch `rc` / `next`**  
Same as Release.yml but `if: github.ref == 'refs/heads/rc'` and `NPM_DIST_TAG=rc`. Changesets/action version+publish on that branch while `.changeset/pre.json` is present.

**Decision to lock in implementation:** Prefer **A (dispatch publish-only)** so `main` never auto-tags `rc` on every merge. Version bumps for RCs land via an explicit PR that includes `.changeset/pre.json`.

### 4. Docs

- `scripts/README.md`: RC vs `pack:local`.
- Consumer note: install `@rc` / pin `-rc.N`; peer `ai` still host-owned once that lands.
- `notes/human-validation.md`: optional “install RC into a sibling repo” checklist item.

### 5. Smoke

- Publish one dry-run or real RC to npm (maintainer).
- In an external project: `npm i @agent-dev-lab/core@rc` resolves without `file:`.
- Confirm `npm view @agent-dev-lab/core dist-tags` shows `latest` unchanged and `rc` → the new version.

---

## Out of scope

- Replacing Changesets with a custom semver tool.
- Publishing RCs from every PR automatically.
- GitHub Packages / private registry.
- Changing `pack:local` semantics.
- Promoting RC → latest without `pre exit` + normal Release flow.

---

## Success criteria

1. Maintainer can publish `*.*.*-rc.N` for core/tools/cli/web to npm with dist-tag `rc`.
2. `latest` dist-tag is unchanged by that publish.
3. External project installs via `@rc` or exact RC version — no relative `file:` path.
4. `ci-publish.sh` still publishes stables as today when version has no prerelease.
5. Documented enter/exit `pre` so `main` stable releases are not stuck in prerelease mode.
6. `.claude/gate.sh full` green for any script/workflow changes.

---

## Gaps / not done

- **Live npm smoke** (publish one RC, `npm i @agent-dev-lab/core@rc` in an external project, confirm `dist-tags`) — deferred when Production OIDC/npm creds are unavailable in the task fork; checklist in `notes/human-validation.md` § Registry release candidates.
- Whether CLI/web RCs must always ship as a matched set (same `-rc.N`) — default **yes** via versioning all four when changesets exist; `require-prerelease-versions.ts` refuses a mixed stable/prerelease set at Publish RC time.
- npm OIDC already covers the four packages; confirm tag publish does not need extra npm UI config (expected: same trusted publishers).

### Landed

- `scripts/npm-dist-tag.ts` + `ci-publish.sh` `--tag` / refuse prerelease+`latest`.
- `.github/workflows/release.yml` **Publish RC** job — `workflow_dispatch` with `confirm=publish-rc` + `ref`, publish-only with `NPM_DIST_TAG=rc` (same file as stable Release so npm OIDC trusts it).
- Maintainer docs: `scripts/README.md`, `AGENTS.md` pointer, `human-validation.md` checklist.
