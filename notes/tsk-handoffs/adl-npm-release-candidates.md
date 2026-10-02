# HANDOFF — adl-npm-release-candidates

## Goal

Add npm **release-candidate** publishing for `@agent-dev-lab/{core,tools,cli,web}` so external projects can install real RC versions / `@rc` instead of `file:` paths. See `notes/npm-release-candidates.md`.

## Principles

- Fail closed; upstream before workaround (Changesets `pre` mode); one concern; plan first; state gaps.
- Never publish an RC under the `latest` dist-tag.
- Reuse `scripts/ci-publish.sh` (pack → npm publish); do not fork a second publish pipeline.

## Scope

1. Extend `ci-publish.sh` with `NPM_DIST_TAG` and/or prerelease→`rc` tag inference; refuse prerelease+`latest`.
2. Wire a **manual** CI entry (prefer `workflow_dispatch` publish-only on Release or a sibling workflow) — not auto-RC on every `main` push.
3. Document maintainer flow: `changeset pre enter rc` → version → publish with `rc` tag → `changeset pre exit` before stable.
4. Update `scripts/README.md` (and a short pointer from AGENTS.md or human-validation): RC vs `pack:local`.
5. Smoke: external install of `@agent-dev-lab/core@rc` (or document deferred if npm creds unavailable in the fork — then leave a checklist for the maintainer).

## Out of scope

- Auto-publishing RCs from every PR.
- Changing `pack:local`.
- AI SDK upgrade / execution-control features.
- Dual registries.

## Success criteria

1. Script + docs (and CI dispatch) land; `gate.sh full` green for repo changes.
2. An RC version can be published with dist-tag `rc` without moving `latest`.
3. Consumer install instructions use `@rc` or `x.y.z-rc.n` — no relative paths.
4. Stable `release.yml` path on `main` still publishes `latest` as today after `pre exit`.

## Constraints

- Prefer Changesets docs over custom preid math.
- OIDC trusted publishing stays the auth path.
- Do not leave `.changeset/pre.json` on `main` after a stable release without `pre exit`.

## Handoff notes

Plan: `notes/npm-release-candidates.md`. Provision:

```bash
tsk task fork --handoff notes/tsk-handoffs/adl-npm-release-candidates.md adl-npm-release-candidates
```
