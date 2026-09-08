/**
 * The matcher behind `AddressPolicy.allowedUrls`: a small, deliberately narrow pattern language
 * for a security-critical allowlist — not a general-purpose glob engine (house rule 2's
 * "prefer a documented API" cuts the other way here: a full glob library brings extglobs, brace
 * expansion, and negation, none of which this allowlist wants, and every one of them is a
 * feature someone could misread while auditing what a pattern actually permits). Two forms:
 *
 * - **A glob `string`** — literal characters match themselves, `*` matches one path segment
 *   (any run of characters other than `/`), and `**` matches anything, including `/`. Nothing
 *   else is special: no `?`, no `[...]` character classes, no `{...}` brace expansion. That is
 *   the entire language, on purpose.
 * - **A `RegExp`** — matched over the **whole** candidate string regardless of the pattern's own
 *   anchors (see {@link matchesUrlPattern}'s doc comment for why a partial match is never
 *   enough here).
 *
 * Both forms are matched against {@link urlMatchCandidate}, not the raw URL string — see its own
 * doc comment for exactly what that excludes and why.
 */
export type UrlPattern = string | RegExp;

/** Regex metacharacters that must be escaped when a glob's literal text is spliced into a
 * `RegExp` source. `*` is excluded — it is the one character the glob syntax gives meaning to,
 * and is translated separately. */
const REGEX_SPECIAL = new Set([".", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);

/**
 * Compiles one glob string to a `RegExp` anchored over the whole string. `*` becomes `[^/]*`
 * (stops at a path separator, so a host or path wildcard can't silently swallow a `/` the author
 * didn't write); `**` becomes `.*` (crosses separators, for "this whole subtree"). Every other
 * character is matched literally — in particular a literal `.` in a glob is a literal `.` in the
 * regex, never "any character", which matters directly for a hostname allowlist
 * (`docs.internal` must not also match `docsXinternal`).
 */
function compileGlob(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        source += ".*";
        i++;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    source += REGEX_SPECIAL.has(char as string) ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`);
}

/**
 * True when `pattern` matches `candidate` **in full** — a partial match is never a match here,
 * regardless of whether `pattern` is a glob (always whole-string, per `compileGlob`) or a
 * `RegExp` supplied directly.
 *
 * A caller-supplied `RegExp` is checked by requiring `exec`'s own match to span the entire
 * candidate (`match[0] === candidate`), not by trusting the pattern's own `^`/`$` anchors. Those
 * anchors are easy to omit by accident (`/docs\.internal/` reads like "the host is
 * docs.internal" but, unanchored, also matches `evil.com/docs.internal-is-a-lie` as a
 * substring) — checking the matched span instead of the pattern's punctuation means an
 * unanchored pattern fails closed instead of silently permitting more than its author intended.
 * `g`/`y` flags are stripped before matching so a shared, stateful `RegExp` (`lastIndex`) can't
 * make this check depend on how many times it has already run.
 */
export function matchesUrlPattern(pattern: UrlPattern, candidate: string): boolean {
  if (typeof pattern === "string") {
    return compileGlob(pattern).test(candidate);
  }
  const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
  const match = stateless.exec(candidate);
  return match !== null && match[0] === candidate;
}
