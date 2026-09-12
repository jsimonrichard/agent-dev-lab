# Plan: unify allowRead / allowWrite resolution

**Status:** superseded for the unbounded sentinel — see change
`fix(tools): allowRead ** for unbounded; null always deny-all`.  
Core omit→`[anchor]` / no write∪read / escape-hatch omit→`allowWrite` decisions still stand.

## Goal (still true)

One shared resolution path so omitted `allowRead` is **`[anchor]`** at providers/jail.

## Decisions (still true)

1. Do **not** auto-union `allowWrite` into `allowRead` (deferred).
2. Do **not** invent cwd on executors; providers fill `[cwd]`.
3. `allowRead: []` / `null` = deny-all.

## Superseded

- `nullMeans` option — removed; `null` is always deny-all.
- String sentinel `"unbounded"` — replaced by `"**"` (`UNBOUNDED_ALLOW_READ`).
- Bash executor `allowRead: null` meaning host-wide — now `UNBOUNDED_ALLOW_READ`.
