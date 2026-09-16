import { isIP } from "node:net";

/**
 * Host matching for `allowedDomains` / `deniedDomains`, aligned with ASRT's
 * `matchesDomainPattern` / `matchesDomainPatternWithPort` (not on that package's
 * public export — copy the rules rather than deep-importing `dist/`).
 *
 * Patterns:
 * - `*` matches any host (and any port)
 * - `*.example.com` matches strict subdomains, never the apex, never IP literals
 * - anything else is an exact hostname match (case-insensitive)
 * - an optional `:port` suffix (`example.com:443`) restricts the destination port;
 *   omitted port matches every port
 */
export function matchesDomainPattern(hostname: string, pattern: string): boolean {
  const host = stripBrackets(hostname).toLowerCase();
  if (pattern === "*") {
    return true;
  }
  if (pattern.startsWith("*.")) {
    if (isIP(host) !== 0) {
      return false;
    }
    const baseDomain = pattern.slice(2).toLowerCase();
    return host.endsWith(`.${baseDomain}`);
  }
  return host === pattern.toLowerCase();
}

export function matchesDomainPatternWithPort(
  hostname: string,
  port: number,
  pattern: string,
): boolean {
  const { hostPattern, port: patternPort } = splitDomainPatternPort(pattern);
  if (patternPort !== undefined && patternPort !== port) {
    return false;
  }
  return matchesDomainPattern(hostname, hostPattern);
}

/**
 * Destination allow/deny for a hostname+port.
 *
 * `allowedDomains` omitted → no allowlist (any host, subject to deny). Empty
 * `allowedDomains` denies every host. A matching `deniedDomains` entry always
 * denies, even when the allowlist would have passed.
 */
export function hostAllowedByDomainLists(
  hostname: string,
  port: number,
  lists: {
    allowedDomains?: readonly string[];
    deniedDomains?: readonly string[];
  },
): boolean {
  if (
    lists.deniedDomains?.some((pattern) => matchesDomainPatternWithPort(hostname, port, pattern))
  ) {
    return false;
  }
  if (lists.allowedDomains === undefined) {
    return true;
  }
  return lists.allowedDomains.some((pattern) =>
    matchesDomainPatternWithPort(hostname, port, pattern),
  );
}

function stripBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function splitDomainPatternPort(pattern: string): {
  hostPattern: string;
  port: number | undefined;
} {
  if (pattern.startsWith("[")) {
    const close = pattern.indexOf("]");
    if (close === -1) {
      return { hostPattern: pattern, port: undefined };
    }
    const host = stripBrackets(pattern.slice(0, close + 1));
    const rest = pattern.slice(close + 1);
    if (rest === "") {
      return { hostPattern: host, port: undefined };
    }
    const port = parsePortSuffix(rest.startsWith(":") ? rest.slice(1) : "");
    return port === undefined
      ? { hostPattern: pattern, port: undefined }
      : { hostPattern: host, port };
  }
  const idx = pattern.lastIndexOf(":");
  if (idx === -1) {
    return { hostPattern: pattern, port: undefined };
  }
  if (pattern.indexOf(":") !== idx) {
    return { hostPattern: pattern, port: undefined };
  }
  const port = parsePortSuffix(pattern.slice(idx + 1));
  if (port === undefined) {
    return { hostPattern: pattern, port: undefined };
  }
  return { hostPattern: pattern.slice(0, idx), port };
}

function parsePortSuffix(suffix: string): number | undefined {
  if (!/^[1-9][0-9]{0,4}$/.test(suffix)) {
    return undefined;
  }
  const port = Number(suffix);
  return port > 65535 ? undefined : port;
}
