import type { AddressInfo } from "node:net";

/**
 * Loopback URL for a Vite `httpServer` listen address. Vite's default `localhost`
 * bind is often IPv6 (`::1`); hardcoding `127.0.0.1` then gets ConnectionRefused
 * and the watch-arm plugin kills the process. Wildcard binds (`0.0.0.0` / `::`)
 * are rewritten to a loopback of the same family — you cannot fetch `0.0.0.0`.
 */
export function viteListenLoopbackUrl(addr: AddressInfo, pathname: string): string {
  const ipv6 = addr.address.includes(":");
  let host: string;
  if (ipv6) {
    host = addr.address === "::" ? "[::1]" : `[${addr.address}]`;
  } else {
    host = addr.address === "0.0.0.0" ? "127.0.0.1" : addr.address;
  }
  return `http://${host}:${addr.port}${pathname}`;
}
