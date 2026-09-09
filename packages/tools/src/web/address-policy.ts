import { lookup as dnsLookup } from "node:dns/promises";

import { AdlError } from "@agent-dev-lab/core";
import ipaddr from "ipaddr.js";

import { matchesUrlPattern, type UrlPattern } from "./url-pattern.ts";

/**
 * The address guard: decides whether one URL may be fetched at all. Applied to the URL the model
 * asked for **and, identically, to every redirect hop** — see `fetchGuardedUrl`. A redirect
 * landing on `169.254.169.254` or `127.0.0.1` — whether written literally, or reached by
 * resolving a plain `http:` hostname — is the case this exists for, and it is not a special case
 * here: it is the same function called again in a loop.
 *
 * **Two checks, deliberately different in scope, because the threat each defends against is
 * different:**
 *
 * 1. **A literal IP address in the hostname** — no DNS involved at all — is checked
 *    **regardless of scheme**: `http://127.0.0.1/x` and `https://127.0.0.1/x` are both refused.
 *    There is no DNS-rebinding question here (nothing was resolved), so this is unconditionally
 *    sound and unconditionally applied.
 * 2. **A domain name's resolved address** is checked **only for `http:`**, not `https:`. This is
 *    a real, considered asymmetry, not an oversight:
 *    - For `https:`, TLS's own hostname verification is already a meaningful backstop against a
 *      domain rebinding into a private address: the rebound connection still has to present a
 *      certificate that validates for the attacker's own hostname, and an internal service that
 *      happens to be reachable essentially never has one (it serves no TLS at all, or an
 *      internally-issued cert outside the default trust chain for an unrelated reason).
 *      Resolving and classifying the domain ourselves would add little beyond what TLS already
 *      does, while still carrying the false-positive cost of blocking a legitimate internal
 *      HTTPS domain with no way to distinguish it from an attack.
 *    - For `http:`, there is no TLS in the picture at all, so nothing else defends against this
 *      — and this is exactly how the highest-value real target class is served: cloud metadata
 *      services (`169.254.169.254`) are plain HTTP, unauthenticated. So the resolve-and-classify
 *      step earns its keep specifically here, restored for this one case.
 *
 * **Known limitation — DNS rebinding (TOCTOU), for the `http:` domain-name check.** This resolves
 * the hostname, checks the answers, and then hands the *hostname* to `fetch`, which resolves it
 * a second time; a resolver that returns a public address to us and a private one to `fetch`
 * would defeat the check. Closing that hole fully means pinning the connection to the address we
 * validated, which needs a runtime-specific dispatcher (undici's `connect.lookup`) that Bun's
 * `fetch` does not implement — a stated gap, not a silently-assumed-away one, and one this
 * package's own research found is treated the same way in comparable tools: the documented
 * mitigation industry write-ups give for this ("refuse to follow redirects whose target resolves
 * to a private network") is exactly the resolve-and-classify-per-hop check below, not full
 * connection pinning. Same class of gap as `createFileJail`'s own symlink TOCTOU note
 * (`src/file/jail.ts`): a userland check, not a kernel- or transport-enforced boundary. See
 * `packages/tools/README.md`'s "Address guard" section for the CVE, library, and write-up
 * citations behind this design — not restated here (house rule 2: derive, don't restate).
 *
 * **Allowlist, not denylist**, for both checks: an address is permitted only when `ipaddr.js`
 * classifies it as globally-routable `unicast`; every other classification — `loopback`,
 * `linkLocal` (cloud metadata, `169.254.169.254` / `fe80::`), `private`, `uniqueLocal`,
 * `carrierGradeNat`, `multicast`, `broadcast`, `unspecified`, `reserved`, and the IPv4-in-IPv6
 * tunnel forms `6to4`/`teredo`/`rfc6052` — is refused, as is anything that fails to parse. So a
 * range nobody thought of is denied by default rather than allowed by omission (house rule 1).
 * `ipaddr.js` rather than hand-rolled CIDR math because Node has no CIDR API (house rule 2); zero
 * dependencies, ships its own types. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is unwrapped to its
 * IPv4 form and re-classified, so it cannot smuggle a loopback address past either check.
 */

/** Only these two schemes are ever fetched. `file:`, `data:`, `blob:`, `gopher:`, `ftp:` and
 * anything else are refused — a URL scheme is an unbounded capability surface, so this is an
 * allowlist for the same reason the address checks are. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** The allowed schemes, for `describeWebEnv` to report — derived from the set the guard actually
 * enforces rather than restated alongside it (house rule 2). */
export const ALLOWED_URL_SCHEMES: readonly string[] = [...ALLOWED_PROTOCOLS].map((protocol) =>
  protocol.replace(":", ""),
);

/**
 * The single `ipaddr.js` classification we accept. Deliberately one value: see this module's
 * doc comment on why the check is an allowlist.
 */
const ALLOWED_RANGE = "unicast";

/**
 * Resolves a hostname to every address it might connect to. Matches the shape of
 * `node:dns/promises`' `lookup(host, { all: true })` so the real implementation is the default
 * and tests can substitute a resolver without weakening the policy under test. Only ever called
 * for a domain name being fetched over plain `http:` — see the module doc comment for why.
 */
export type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

const defaultResolver: HostnameResolver = async (hostname) => {
  // `verbatim: true` keeps the resolver's own ordering rather than reordering IPv4 first; the
  // order is irrelevant here because every returned address has to pass, but asking for the
  // unmodified answer keeps "what we checked" equal to "what was returned".
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
};

export interface AddressPolicy {
  /**
   * URL patterns (glob strings and/or `RegExp`s — see `url-pattern.ts`) allowed to bypass both
   * address checks — **empty by default**, so nothing bypasses them unless a host explicitly
   * says so.
   *
   * This is a URL-scoped allowlist: it is the ordinary way to reach a literal non-public address
   * on purpose (a test fixture on `127.0.0.1`, say) or an `http:` domain that resolves privately
   * on purpose (a company-internal service with no TLS), and it is matched **per redirect hop**
   * against {@link urlMatchCandidate}, so an allowlisted origin that redirects somewhere else
   * gains that destination nothing — a pattern this permissive for the *first* hop
   * (`http://intranet.example:8080/**`) still blocks a redirect to a different origin entirely.
   * (`allowPrivateNetwork` below is the blanket, non-URL-scoped escape hatch — see its own doc
   * comment for why that's a different tool for a different job, not a rival mechanism.)
   *
   * Path-scoped by design: `http://intranet.example:8080/**` allows the whole origin, but
   * `http://intranet.example:8080/wiki/*` allows only that one directory — precision plain
   * `hostname:port` allowlisting could never express. A literal string with no `*`/`**` (e.g.
   * one copied from this guard's own rejection message) matches only that exact URL.
   */
  allowedUrls?: readonly UrlPattern[];
  /**
   * Disables both address checks entirely — **default `false`** (protection on). Every URL that
   * clears the scheme allowlist is fetched regardless of what its hostname is or resolves to,
   * private/loopback/link-local/metadata-service addresses included.
   *
   * **Not a second enforcement path** (house rule 3: one path) — it is implemented as an
   * unconditional match, checked in the exact same place `allowedUrls` is, so there is one
   * decision point for "is the address exempt," not two independently-maintained ones. In fact
   * `allowedUrls: ["**"]` already has this exact effect today (`**` matches any candidate
   * string); this option exists as a clearer, more discoverable name for that same intent —
   * matching the name a comparable agent framework (OpenClaw) already uses for it — not as new
   * capability.
   *
   * Reported by `describeWebEnv` as its own field (not folded into the `allowedUrls` list, which
   * would misattribute a host-set boolean as something the caller wrote as a pattern) — see
   * `WebAccessInfo.allowPrivateNetwork`.
   *
   * Still a host/workflow-only knob, never model-reachable, the same trust boundary
   * `allowedUrls` and `resolver` already sit behind (see `notes/tool-sandboxing.md`'s "trust,
   * not restriction" note) — this is not exposed on `fetchUrl`'s own input schema.
   */
  allowPrivateNetwork?: boolean;
  /** Hostname resolver, defaulting to `node:dns`' `lookup(..., { all: true })`. */
  resolver?: HostnameResolver;
}

/** The port a request to `url` would actually connect to, with the scheme's default filled in. */
function effectivePort(url: URL): string {
  if (url.port !== "") {
    return url.port;
  }
  return url.protocol === "https:" ? "443" : "80";
}

/**
 * The string `AddressPolicy.allowedUrls` patterns are matched against: scheme, hostname, the
 * effective port, and the path — `${protocol}//${hostname}:${port}${pathname}`. Deliberately
 * excludes the query string, fragment, and any userinfo:
 *
 * - Userinfo (`user:pass@host`) is not part of where the request actually goes — `URL` already
 *   separates it from `hostname`, so it never reaches this string at all.
 * - The query and fragment don't change the network destination either, and including them
 *   would turn this allowlist into a general request-shape ACL rather than what it is: a
 *   statement of which *destinations* an SSRF exemption covers.
 *
 * `hostname` is already lowercased and IDN-normalized by `URL` itself, and `..` segments are
 * already resolved out of `pathname` — so a pattern author writing `docs.internal` or `/a/b`
 * never has to account for either.
 */
export function urlMatchCandidate(url: URL): string {
  return `${url.protocol}//${url.hostname}:${effectivePort(url)}${url.pathname}`;
}

/**
 * True when `address` is a globally-routable unicast address. Anything unparseable is `false` —
 * an address we cannot classify is not an address we fetch.
 */
export function isPublicAddress(address: string): boolean {
  let parsed;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  // An IPv4-mapped IPv6 address is just an IPv4 address in disguise; classify the real thing.
  // `in` narrows the `IPv4 | IPv6` union — only `IPv6` declares this method — so no cast is
  // needed to reach it (house rule 2: a type guard before a cast).
  if ("isIPv4MappedAddress" in parsed && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === ALLOWED_RANGE;
  }
  return parsed.range() === ALLOWED_RANGE;
}

/**
 * The literal IP address a URL's hostname names, or `undefined` when the hostname is a domain
 * name rather than an address literal. `URL` brackets an IPv6 hostname (`"[::1]"`); `ipaddr.js`
 * doesn't accept the brackets, so they're stripped before classification. A domain name simply
 * fails `ipaddr.isValid` and returns `undefined`.
 */
function literalIpAddress(hostname: string): string | undefined {
  const unbracketed =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return ipaddr.isValid(unbracketed) ? unbracketed : undefined;
}

/** Assembles the rejection message both address checks share, naming the fix. */
function rejectNonPublic(url: URL, offendingAddresses: readonly string[]): never {
  throw new AdlError(
    "INVALID_INPUT",
    `Refusing to fetch "${url.href}": "${offendingAddresses.join(", ")}" is not a public ` +
      `address. Private, loopback, link-local (including cloud metadata services), and other ` +
      `non-globally-routable addresses are blocked. Add "${url.protocol}//${url.hostname}:` +
      `${effectivePort(url)}/**" to the tool's allowedUrls to permit this origin on purpose, ` +
      `or scope it to one path with something like ".../a-specific-path/*".`,
  );
}

/**
 * Throws unless `url` may be fetched. Checks, in order: the scheme (absolute — nothing below can
 * exempt a non-`http(s)` URL, not `allowedUrls` and not `allowPrivateNetwork`), then whether the
 * address checks are exempted at all (`allowPrivateNetwork`, or a matching `allowedUrls` entry),
 * then the address itself — a literal IP in the hostname regardless of scheme, or (only for
 * `http:`) every address a domain name resolves to. See the module doc comment for why the
 * domain-resolution check is scheme-conditional.
 *
 * When a domain resolves (the `http:` case), every resolved address must pass, not merely one of
 * them: the connection picks an address from that set and this code does not get to choose
 * which, so a hostname with one public and one private answer is refused rather than gambled on.
 */
export async function assertAllowedUrl(url: URL, policy: AddressPolicy = {}): Promise<void> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": scheme "${url.protocol}" is not allowed — only ` +
        `${[...ALLOWED_PROTOCOLS].join(" and ")} URLs can be fetched.`,
    );
  }

  const candidate = urlMatchCandidate(url);
  if (
    policy.allowPrivateNetwork ||
    policy.allowedUrls?.some((pattern) => matchesUrlPattern(pattern, candidate))
  ) {
    return;
  }

  const literal = literalIpAddress(url.hostname);
  if (literal !== undefined) {
    if (!isPublicAddress(literal)) {
      rejectNonPublic(url, [literal]);
    }
    return;
  }

  // From here, `url.hostname` is a domain name, not an address literal.
  if (url.protocol !== "http:") {
    // https: TLS's own hostname verification is the backstop (see module doc comment) —
    // resolving and classifying the domain ourselves isn't attempted.
    return;
  }

  const resolver = policy.resolver ?? defaultResolver;
  let addresses: readonly string[];
  try {
    addresses = await resolver(url.hostname);
  } catch (cause) {
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": could not resolve host "${url.hostname}" to check it ` +
        `against the address policy.`,
      { cause },
    );
  }

  // No answers means nothing was checked, which is not the same as nothing being wrong.
  if (addresses.length === 0) {
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": host "${url.hostname}" resolved to no addresses.`,
    );
  }

  const blocked = addresses.filter((address) => !isPublicAddress(address));
  if (blocked.length > 0) {
    rejectNonPublic(url, blocked);
  }
}
