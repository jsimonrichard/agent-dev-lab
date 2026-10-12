import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { isLoopbackHostHeader } from "#/lib/loopback-host";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const loopbackHostMiddleware = createMiddleware().server(({ request, next }) => {
  if (!isLoopbackHostHeader(request.headers.get("host"))) {
    return new Response("Forbidden: the inspector only answers on a loopback host name.", {
      status: 403,
    });
  }
  return next();
});

/**
 * Server functions and `/api` routes both mutate runs (approve, cancel, retry), so every
 * non-safe method must come from the inspector's own origin. Clients that send no Origin,
 * Sec-Fetch-Site, or Referer (curl, the CLI) are not browsers and cannot be driven cross-site.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: ({ request }) => !SAFE_METHODS.has(request.method),
  allowRequestsWithoutOriginCheck: true,
});

export const startInstance = createStart(() => ({
  requestMiddleware: [loopbackHostMiddleware, csrfMiddleware],
}));
