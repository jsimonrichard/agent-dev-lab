/**
 * Model-facing stand-in for unbounded filesystem reads (`allowRead === null` on bash
 * executors; jail primitive `undefined`). A string, not `null` or `[]` — those encode
 * "omitted" vs "bounded to nothing" in the executor/jail contracts, which the model
 * should not have to know.
 *
 * Lives in a leaf module so file tools can import it without pulling `bash/provider`
 * (and its Node-ESM dependency graph) into search/native executor tests.
 */
export const UNBOUNDED_ALLOW_READ = "unbounded" as const;

/** Resolved `allowRead` as `describe*Env` reports it. */
export type ModelAllowRead = string[] | typeof UNBOUNDED_ALLOW_READ;
