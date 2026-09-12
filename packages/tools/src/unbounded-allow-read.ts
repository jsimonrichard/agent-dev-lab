/**
 * Host-wide filesystem reads. The whole `allowRead` value is this sentinel — not a path
 * entry inside a list. Chosen as `"**"` so it cannot collide with a real path name the way
 * a word like `"unbounded"` could.
 *
 * Lives in a leaf module so file tools can import it without pulling `bash/provider`
 * (and its Node-ESM dependency graph) into search/native executor tests.
 *
 * `null` / `[]` mean nothing readable. Omitted `allowRead` means `[cwd]` / `[root]` at
 * providers and the file jail.
 */
export const UNBOUNDED_ALLOW_READ = "**" as const;

/** Resolved `allowRead` as `describe*Env` reports it. */
export type ModelAllowRead = string[] | typeof UNBOUNDED_ALLOW_READ;
