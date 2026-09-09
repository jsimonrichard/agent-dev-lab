/**
 * The matcher behind `AddressPolicy.allowedUrls`: a small, deliberately narrow pattern language,
 * not a general-purpose glob engine — see `README.md` for why. A glob `string` (literal text, `*`
 * for one path segment, `**` for anything including `/`) or a `RegExp`, both matched against
 * {@link urlMatchCandidate}, never the raw URL.
 */
export type UrlPattern = string | RegExp;

/** Regex metacharacters escaped when a glob's literal text is spliced into a `RegExp` source.
 * `*` is excluded — it's the one character the glob syntax gives meaning to. */
const REGEX_SPECIAL = new Set([".", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);

/**
 * Compiles one glob string to a `RegExp` anchored over the whole string. `*` becomes `[^/]*`
 * (stops at `/`); `**` becomes `.*` (crosses it). Everything else is literal — a `.` in a glob is
 * a literal dot, never "any character" (`docs.internal` must not also match `docsXinternal`).
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
 * True when `pattern` matches `candidate` **in full** — always whole-string for a glob (per
 * `compileGlob`); for a `RegExp`, by requiring `exec`'s own match to span the entire candidate
 * (`match[0] === candidate`) rather than trusting the pattern's own anchors, so an author who
 * forgets `^`/`$` fails closed instead of matching a substring. `g`/`y` flags are stripped so a
 * shared, stateful `RegExp`'s `lastIndex` can't affect the result.
 */
export function matchesUrlPattern(pattern: UrlPattern, candidate: string): boolean {
  if (typeof pattern === "string") {
    return compileGlob(pattern).test(candidate);
  }
  const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
  const match = stateless.exec(candidate);
  return match !== null && match[0] === candidate;
}
