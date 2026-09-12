import { lookup as dnsLookup } from "node:dns/promises";

import { AdlError } from "@agent-dev-lab/core";
import ipaddr from "ipaddr.js";

import { matchesUrlPattern, type UrlPattern } from "./url-pattern.ts";

/**
 * The address guard: decides whether a URL may be fetched, on the initial URL and again on every
 * redirect hop (see `fetchGuardedUrl`). Two checks, both applied regardless of scheme — a literal
 * IP in the hostname, and a domain name's resolved address — both an allowlist against
 * `ipaddr.js`'s `range()` classification. For an `http:` domain name, the validated address is
 * also returned so `fetch.ts` can pin the connection to it — see `README.md`'s "Address guard"
 * section for the full threat model, why pinning is `http:`-only, the DNS-rebinding limitation it
 * closes for `http:` but not `https:`, and citations; this file states behavior, not why.
 */

/** Only these two schemes are ever fetched — a URL scheme is an unbounded capability surface. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** The allowed schemes, for `describeWebEnv` to report — derived from the set actually enforced
 * rather than restated alongside it. */
export const ALLOWED_URL_SCHEMES: readonly string[] = [...ALLOWED_PROTOCOLS].map((protocol) =>
  protocol.replace(":", ""),
);

/** The single `ipaddr.js` classification the address checks accept. */
const ALLOWED_RANGE = "unicast";

/**
 * Resolves a hostname to every address it might connect to. Matches
 * `node:dns/promises`'s `lookup(host, { all: true })` so the real implementation is the default
 * and tests can substitute one. Called for any domain name that reaches the address check,
 * regardless of scheme — pinning the first answer is `http:`-only, but the check itself is not.
 */
export type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

const defaultResolver: HostnameResolver = async (hostname) => {
  // `verbatim: true`: every answer has to pass regardless of order, but this keeps "what we
  // checked" equal to "what was returned" rather than reordering it first.
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
};

export interface AddressPolicy {
  /**
   * URL patterns (glob strings and/or `RegExp`s — see `url-pattern.ts`) that may bypass both
   * address checks **when the matching pattern names a concrete host**. Host-unrestricted
   * patterns (whole-pattern wildcards, host labels that are only wildcards, a broad
   * `RegExp`) do **not** bypass — set `allowPrivateNetwork` for that. Empty by default.
   * Matched **per redirect hop** against {@link urlMatchCandidate}.
   */
  allowedUrls?: readonly UrlPattern[];
  /**
   * Disables both address checks entirely. Default `false`. Checked at the same decision point as
   * a concrete-host `allowedUrls` match (not a second enforcement path) — see `README.md`'s
   * "allowPrivateNetwork" section. Host/workflow-only, like `allowedUrls`; never exposed on
   * `fetchUrl`'s input schema.
   */
  allowPrivateNetwork?: boolean;
  /** Hostname resolver, defaulting to `node:dns`' `lookup(..., { all: true })`. */
  resolver?: HostnameResolver;
}

/** The port a request to `url` would actually connect to, with the scheme's default filled in.
 * Exported for `fetch.ts` to reuse when dialing a pinned address — the same "what port does this
 * URL mean" question, not a second answer to it. */
export function effectivePort(url: URL): string {
  if (url.port !== "") {
    return url.port;
  }
  return url.protocol === "https:" ? "443" : "80";
}

/**
 * The string `AddressPolicy.allowedUrls` patterns are matched against:
 * `${protocol}//${hostname}:${port}${pathname}`. Excludes userinfo (never reaches `hostname`),
 * query, and fragment (don't change the network destination) — see `README.md` for why. `hostname`
 * is already lowercased/IDN-normalized and `pathname` already has `..` resolved out, by `URL`
 * itself.
 */
export function urlMatchCandidate(url: URL): string {
  return `${url.protocol}//${url.hostname}:${effectivePort(url)}${url.pathname}`;
}

/**
 * True when `address` is a globally-routable unicast address. Anything unparseable is `false`.
 */
export function isPublicAddress(address: string): boolean {
  let parsed;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  // An IPv4-mapped IPv6 address is an IPv4 address in disguise; classify the real thing. `in`
  // narrows the `IPv4 | IPv6` union (only `IPv6` declares this method), so no cast is needed.
  if ("isIPv4MappedAddress" in parsed && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === ALLOWED_RANGE;
  }
  return parsed.range() === ALLOWED_RANGE;
}

/**
 * The literal IP address a URL's hostname names, or `undefined` for a domain name. `URL` brackets
 * an IPv6 hostname (`"[::1]"`); `ipaddr.js` doesn't accept the brackets, so they're stripped first.
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
      `or scope it to one path with something like ".../a-specific-path/*". Host-wildcard ` +
      `patterns like "**" do not bypass this check — set allowPrivateNetwork: true for that.`,
  );
}

/**
 * Probes used to detect a host-unrestricted `RegExp`: if the pattern matches both of these
 * unrelated private candidates, it is treated as unbounded (fail closed) and does not bypass.
 */
const PRIVATE_BYPASS_PROBES = [
  urlMatchCandidate(new URL("http://127.0.0.1:8080/")),
  urlMatchCandidate(new URL("http://10.0.0.1:80/")),
] as const;

/**
 * Authority (host[:port]) from a URL-shaped glob, or `undefined` when the pattern is not
 * `scheme://…`.
 */
function authorityFromUrlGlob(pattern: string): string | undefined {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/.exec(pattern);
  return match?.[1];
}

/** Host label only — strip a trailing `:port` when present (port may itself be `*` / `**`). */
function hostLabelFromAuthority(authority: string): string {
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    if (end !== -1) {
      return authority.slice(0, end + 1);
    }
  }
  const colon = authority.lastIndexOf(":");
  if (colon === -1) {
    return authority;
  }
  return authority.slice(0, colon);
}

/**
 * True when a matching pattern is **not** enough to skip the address checks — the host is
 * unrestricted (only wildcards), so `allowPrivateNetwork` is still required for private targets.
 */
export function isHostUnrestrictedUrlPattern(pattern: UrlPattern): boolean {
  if (typeof pattern === "string") {
    if (pattern === "*" || pattern === "**") {
      return true;
    }
    const authority = authorityFromUrlGlob(pattern);
    if (authority === undefined) {
      // Not URL-shaped — fail closed if it matches both private probes.
      return PRIVATE_BYPASS_PROBES.every((probe) => matchesUrlPattern(pattern, probe));
    }
    const host = hostLabelFromAuthority(authority);
    return host === "*" || host === "**";
  }
  return PRIVATE_BYPASS_PROBES.every((probe) => matchesUrlPattern(pattern, probe));
}

/**
 * True when this policy skips both address checks for `candidate` (already a
 * {@link urlMatchCandidate}). `allowPrivateNetwork`, or a matching pattern with a concrete host.
 */
function bypassesAddressChecks(policy: AddressPolicy, candidate: string): boolean {
  if (policy.allowPrivateNetwork) {
    return true;
  }
  return (
    policy.allowedUrls?.some(
      (pattern) => matchesUrlPattern(pattern, candidate) && !isHostUnrestrictedUrlPattern(pattern),
    ) ?? false
  );
}

/**
 * `assertAllowedUrl`'s result on success. `pinnedAddress` names the exact address `fetch.ts` must
 * connect the socket to, instead of letting `fetch`'s own independent resolution decide — set
 * only when this call actually resolved a domain name for `http:` (unset for a literal IP or a
 * bypassed check, where nothing was resolved to pin, and for `https:`, where pinning without also
 * spoofing the TLS handshake's SNI would be meaningless — see `README.md`'s "IP pinning" section).
 */
export interface AddressCheckResult {
  pinnedAddress?: string;
}

/**
 * Throws unless `url` may be fetched. Order: scheme (absolute — nothing below exempts a
 * non-`http(s)` URL) → `allowPrivateNetwork` / concrete-host `allowedUrls` → the address itself
 * (a literal IP, or every address a domain name resolves to — both regardless of scheme).
 *
 * When a domain resolves, every answer must pass, not merely one: the connection picks an address
 * from that set and this code doesn't choose which, so a mixed public/private answer is refused.
 */
export async function assertAllowedUrl(
  url: URL,
  policy: AddressPolicy = {},
): Promise<AddressCheckResult> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AdlError(
      "INVALID_INPUT",
      `Refusing to fetch "${url.href}": scheme "${url.protocol}" is not allowed — only ` +
        `${[...ALLOWED_PROTOCOLS].join(" and ")} URLs can be fetched.`,
    );
  }

  const candidate = urlMatchCandidate(url);
  if (bypassesAddressChecks(policy, candidate)) {
    return {};
  }

  const literal = literalIpAddress(url.hostname);
  if (literal !== undefined) {
    if (!isPublicAddress(literal)) {
      rejectNonPublic(url, [literal]);
    }
    return {};
  }

  // `url.hostname` is a domain name from here, resolved and classified the same way regardless
  // of scheme — see `README.md` for why this runs for `https:` too, and for the DNS-rebinding
  // TOCTOU this check alone does not close (only pinning the connection, below, closes it, and
  // only for `http:`).
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

  // `addresses[0]` is safe unchecked: the length check above already guarantees an element.
  // https: doesn't pin — see `AddressCheckResult`'s doc comment for why.
  return url.protocol === "http:" ? { pinnedAddress: addresses[0]! } : {};
}
