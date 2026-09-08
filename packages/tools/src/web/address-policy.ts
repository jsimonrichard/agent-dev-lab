import { lookup as dnsLookup } from "node:dns/promises";

import { AdlError } from "@agent-dev-lab/core";
import ipaddr from "ipaddr.js";

/**
 * The SSRF guard: decides whether one URL may be fetched at all. Applied to the URL the model
 * asked for **and, identically, to every redirect hop** — see `fetchGuardedUrl`. A public
 * hostname that 302s to `169.254.169.254` or `127.0.0.1` is the case this exists for, and it is
 * not a special case here: it is the same function called again in a loop.
 *
 * **Allowlist, not denylist.** An address is permitted only when `ipaddr.js` classifies it as
 * globally-routable `unicast`; every other classification — `loopback`, `linkLocal` (which is
 * where the cloud metadata services live, `169.254.169.254` / `fe80::`), `private`,
 * `uniqueLocal`, `carrierGradeNat`, `multicast`, `broadcast`, `unspecified`, `reserved`, and the
 * IPv4-in-IPv6 tunnel forms `6to4`/`teredo`/`rfc6052` — is refused, as is anything that fails to
 * parse. So a range nobody thought of is denied by default rather than allowed by omission
 * (house rule 1). `ipaddr.js` rather than hand-rolled CIDR math because Node has no CIDR API and
 * that library's `range()` already names every one of those classes (house rule 2); it has zero
 * dependencies and ships its own types.
 *
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is unwrapped to its IPv4 form and re-classified, so it
 * cannot be used to smuggle a loopback address past the check. The tunnel forms above embed an
 * IPv4 address too, but they are deprecated transition mechanisms with no legitimate use here,
 * so they are refused outright rather than unwrapped.
 *
 * **Known limitation — DNS rebinding (TOCTOU).** This resolves the hostname, checks the answers,
 * and then hands the *hostname* to `fetch`, which resolves it a second time; a resolver that
 * returns a public address to us and a private one to `fetch` would defeat the check. Closing
 * that hole means pinning the connection to the address we validated, which needs a
 * runtime-specific dispatcher (undici's `connect.lookup`) that Bun's `fetch` does not implement
 * — so it is a stated gap, not a silently-assumed-away one. It is the same class of gap as
 * `createFileJail`'s own symlink TOCTOU note (`src/file/jail.ts`): a userland check, not a
 * kernel- or transport-enforced boundary.
 */

/** Only these two schemes are ever fetched. `file:`, `data:`, `blob:`, `gopher:`, `ftp:` and
 * anything else are refused — a URL scheme is an unbounded capability surface, so this is an
 * allowlist for the same reason the address check is. */
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
 * and tests can substitute a resolver without weakening the policy under test.
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
   * Exact `hostname:port` origins allowed to bypass the address classification — **empty by
   * default**, so nothing bypasses it unless a host explicitly says so.
   *
   * This is an allowlist, not a switch that turns the guard off: it is the only way to reach a
   * non-public address (a company-internal docs service, or a test fixture server on
   * `127.0.0.1`), and it is matched per redirect hop, so an allowlisted origin that redirects
   * somewhere else gains that destination nothing. Entries are compared as
   * `url.hostname + ":" + effective port`, with the scheme's default port filled in when the URL
   * omits it, so `"127.0.0.1:8080"` and `"docs.internal:443"` are both exact matches and neither
   * is a wildcard.
   */
  allowedHosts?: readonly string[];
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

/** `hostname:port`, as `AddressPolicy.allowedHosts` entries are written. */
export function hostKey(url: URL): string {
  return `${url.hostname}:${effectivePort(url)}`;
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
 * Throws unless `url` may be fetched. Checks, in order: the scheme, then `allowedHosts`, then
 * every address the hostname resolves to.
 *
 * Every resolved address must pass, not merely one of them: the connection picks an address from
 * that set and this code does not get to choose which, so a hostname with one public and one
 * private answer is refused rather than gambled on.
 *
 * A URL whose hostname is already an IP literal needs no special handling — `dns.lookup` returns
 * the literal itself, so it flows through the same classification as a resolved name (house
 * rule 3: one path).
 */
export async function assertAllowedUrl(url: URL, policy: AddressPolicy = {}): Promise<void> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": scheme "${url.protocol}" is not allowed — only ` +
        `${[...ALLOWED_PROTOCOLS].join(" and ")} URLs can be fetched.`,
    );
  }

  if (policy.allowedHosts?.includes(hostKey(url))) {
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
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": host "${url.hostname}" resolves to ` +
        `${blocked.join(", ")}, which is not a public address. Private, loopback, link-local ` +
        `(including cloud metadata services), and other non-globally-routable addresses are ` +
        `blocked. Add "${hostKey(url)}" to the tool's allowedHosts to permit this host on ` +
        `purpose.`,
    );
  }
}
