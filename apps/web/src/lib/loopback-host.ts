const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether an HTTP `Host` header names this machine's loopback interface. The inspector only
 * listens on loopback, so any other name means the request was routed here by DNS rebinding.
 */
export function isLoopbackHostHeader(host: string | null): boolean {
  if (!host) {
    return false;
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return LOOPBACK_HOSTNAMES.has(hostname);
}
