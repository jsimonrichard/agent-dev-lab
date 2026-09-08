import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesUrlPattern } from "./url-pattern.ts";

/**
 * `node:test`, matching the rest of `src/web/`. Tests `matchesUrlPattern` directly against plain
 * candidate strings — no `URL` objects, no IP addresses, no `assertAllowedUrl` involved at all.
 * Pattern matching is its own concern, independent of what the candidate string happens to name:
 * whether an address is public or private has nothing to do with whether a glob or `RegExp`
 * matches it, so `address-policy.test.ts` keeps only enough pattern-matching coverage to prove
 * `assertAllowedUrl` actually *wires* `allowedUrls` in — the exhaustive edge cases live here.
 */

describe("matchesUrlPattern — glob strings", () => {
  it("matches literal text exactly, nothing more and nothing less", () => {
    assert.equal(matchesUrlPattern("http://a.example:80/x", "http://a.example:80/x"), true);
    assert.equal(matchesUrlPattern("http://a.example:80/x", "http://a.example:80/xy"), false);
    assert.equal(matchesUrlPattern("http://a.example:80/x", "http://a.example:80/"), false);
  });

  it("`*` matches one path segment — any run of characters other than `/`", () => {
    assert.equal(
      matchesUrlPattern("http://a.example:80/wiki/*", "http://a.example:80/wiki/Home"),
      true,
    );
    // Doesn't cross a `/`: neither a sibling directory...
    assert.equal(
      matchesUrlPattern("http://a.example:80/wiki/*", "http://a.example:80/admin/Home"),
      false,
    );
    // ...nor a nested path.
    assert.equal(
      matchesUrlPattern("http://a.example:80/wiki/*", "http://a.example:80/wiki/Home/history"),
      false,
    );
  });

  it("`**` matches anything, including `/`", () => {
    assert.equal(matchesUrlPattern("http://a.example:80/**", "http://a.example:80/"), true);
    assert.equal(matchesUrlPattern("http://a.example:80/**", "http://a.example:80/a/b/c"), true);
  });

  it("`*` can scope a subdomain wildcard on the host, the same way", () => {
    assert.equal(
      matchesUrlPattern("https://*.intranet.example:443/**", "https://docs.intranet.example:443/x"),
      true,
    );
    assert.equal(
      matchesUrlPattern("https://*.intranet.example:443/**", "https://intranet.example:443/x"),
      false,
    );
  });

  it('a literal `.` matches only a literal dot, never "any character"', () => {
    // If `.` were regex-`.`, this would wrongly match "aXexample".
    assert.equal(matchesUrlPattern("http://a.example:80/**", "http://a.example:80/x"), true);
    assert.equal(matchesUrlPattern("http://a.example:80/**", "http://aXexample:80/x"), false);
  });

  it("every other regex metacharacter in a glob is also matched literally", () => {
    // `?`, `+`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$`, `\` all mean something to a raw RegExp;
    // none of them should here.
    const glob = "http://a.example:80/a+b?c(d)[e]{f}$g^h\\i";
    assert.equal(matchesUrlPattern(glob, "http://a.example:80/a+b?c(d)[e]{f}$g^h\\i"), true);
    assert.equal(matchesUrlPattern(glob, "http://a.example:80/aXbXcXdXeXfXgXhXi"), false);
  });

  it("is always a whole-string match — a glob with no wildcard at all never matches a substring", () => {
    assert.equal(matchesUrlPattern("example", "http://example.com/"), false);
    assert.equal(matchesUrlPattern("example", "example"), true);
  });
});

describe("matchesUrlPattern — RegExp entries", () => {
  it("matches only what the pattern actually describes", () => {
    const pattern = /^http:\/\/a\.example:80\/wiki\/[\w-]+$/;
    assert.equal(matchesUrlPattern(pattern, "http://a.example:80/wiki/Home"), true);
    assert.equal(matchesUrlPattern(pattern, "http://a.example:80/admin/Home"), false);
  });

  it("requires a full match even when the pattern carries no ^/$ anchors", () => {
    // Easy to misread as "matches anything containing this text" — unanchored, `.test()`/
    // `.exec()` would otherwise accept it as a substring of a longer, unrelated string.
    const pattern = /a\.example/;
    // Contains the substring, but isn't the address it names — refused.
    assert.equal(matchesUrlPattern(pattern, "http://evil.example/a.example-is-a-lie"), false);
    // The same pattern is *also* refused against the one string it actually names in part — the
    // point is exactly this: "a.example" alone never spans the whole candidate. Describing
    // enough of it to cover the string end to end (typically with `^`/`$`, as the passing case
    // above does) is what a real match actually requires.
    assert.equal(matchesUrlPattern(pattern, "http://a.example/"), false);
  });

  it("is unaffected by a shared, stateful (global-flagged) RegExp's lastIndex", () => {
    const pattern = /^http:\/\/a\.example:80\/wiki\/[\w-]+$/g;
    const candidate = "http://a.example:80/wiki/Home";
    // Run it enough times that a stateful `exec`/`test` on the same instance would eventually
    // skip a match because `lastIndex` had advanced past it.
    for (let i = 0; i < 5; i++) {
      assert.equal(matchesUrlPattern(pattern, candidate), true, `iteration ${i}`);
    }
  });

  it("is likewise unaffected by a sticky (`y`-flagged) RegExp's lastIndex", () => {
    const pattern = /^http:\/\/a\.example:80\/x$/y;
    const candidate = "http://a.example:80/x";
    for (let i = 0; i < 5; i++) {
      assert.equal(matchesUrlPattern(pattern, candidate), true, `iteration ${i}`);
    }
  });

  it("respects a case-insensitive flag when the author writes one", () => {
    assert.equal(matchesUrlPattern(/^HTTP:\/\/A\.EXAMPLE\/X$/i, "http://a.example/x"), true);
    assert.equal(matchesUrlPattern(/^HTTP:\/\/A\.EXAMPLE\/X$/, "http://a.example/x"), false);
  });
});
