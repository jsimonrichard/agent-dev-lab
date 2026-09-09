import { request as httpRequest, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { AdlError } from "@agent-dev-lab/core";

import { assertAllowedUrl, effectivePort, type AddressPolicy } from "./address-policy.ts";

/**
 * The transport half of `fetchUrl`: follows redirects **by hand** so the address guard runs on
 * every hop, reads the body under a byte cap enforced while reading (not after), and bounds the
 * whole operation with one `AbortSignal` (DNS, every hop, and the body read) composed with the
 * caller's own signal. See `README.md`'s "Transport" section for why each of these is manual, and
 * its "IP pinning" section for why an `http:` hop with a `pinnedAddress` goes out over
 * `node:http` instead of the global `fetch` the rest of this file uses.
 */

/** Statuses that carry a `Location` to follow. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Sent on every request. No version string: house rule 2 forbids restating a value
 * `package.json` already owns, and nothing here needs the version.
 */
const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "user-agent": "agent-dev-lab-tools/fetchUrl",
  accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
};

export interface GuardedFetchOptions {
  /** SSRF policy, applied to the initial URL and to every redirect hop. */
  policy: AddressPolicy;
  /** Wall-clock budget for the entire operation — DNS, all hops, and the body read. */
  timeoutMs: number;
  /** Stop reading the body at this many bytes and report `truncated: true`. */
  maxBytes: number;
  /** How many redirect hops to follow before refusing. */
  maxRedirects: number;
  /** The calling agent run's abort signal, if any. */
  signal?: AbortSignal;
}

export interface GuardedFetchResult {
  /** The URL the last hop actually landed on — the initial URL when nothing redirected. */
  finalUrl: string;
  status: number;
  /** Raw `Content-Type` header, or `null` when the server sent none. */
  contentType: string | null;
  /** Body bytes, at most `maxBytes` of them. */
  body: Uint8Array;
  /** `true` when the body hit `maxBytes` and the rest was discarded. */
  truncated: boolean;
  /** Every URL redirected *to*, in order. Empty when nothing redirected. */
  redirects: string[];
}

/** Parses a model-supplied URL string. A malformed URL is the model's error, not an invariant. */
export function parseRequestUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch (cause) {
    throw new AdlError("INVALID_INPUT", `"${raw}" is not a valid absolute URL.`, { cause });
  }
}

/**
 * Reads at most `maxBytes` from `body`, cancelling the stream as soon as the cap is hit. Not
 * `process-channel.ts`'s `truncatingAppend`: that one keeps draining after the cap (a blocked
 * subprocess pipe needs to keep flowing); here the correct response is to stop and let go.
 */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Releases the connection whichever way this exits. Cancelling an already-closed/errored
    // stream rejects; discarded deliberately so cleanup never replaces the real failure.
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/**
 * Classifies a transport failure — shared by both places that can hit one (issuing the request,
 * reading the body). The deadline firing gets a specific message; a caller-side abort is returned
 * untouched, so an agent run's own cancellation is never disguised as a fetch problem.
 */
function transportFailure(
  action: string,
  url: URL,
  options: GuardedFetchOptions,
  deadline: AbortSignal,
  cause: unknown,
): unknown {
  if (deadline.aborted) {
    return new AdlError(
      "INVALID_INPUT",
      `${action} "${url.href}" exceeded the ${options.timeoutMs}ms timeout.`,
      { cause },
    );
  }
  if (options.signal?.aborted) {
    return cause;
  }
  return new AdlError("INVALID_INPUT", `${action} "${url.href}" failed.`, { cause });
}

/** Resolves a `Location` header against the URL it came from; a malformed one is a dead end. */
function resolveLocation(location: string, base: URL): URL {
  try {
    return new URL(location, base);
  } catch (cause) {
    throw new AdlError(
      "INVALID_INPUT",
      `"${base.href}" redirected to "${location}", which is not a valid URL.`,
      { cause },
    );
  }
}

/**
 * One hop's response, normalized to the fields the redirect loop and body reader need —
 * whichever of {@link issueViaFetch} or {@link issueViaPinnedAddress} produced it. Exported (like
 * `issueViaPinnedAddress` itself) only so `fetch.test.ts` can exercise the pinned path directly:
 * `assertAllowedUrl` only ever pins a *genuinely public* address (never a loopback fixture's), so
 * there's no way to reach it through `fetchGuardedUrl`'s real gate in a network-free test — see
 * `README.md`'s "Testing" section.
 */
export interface HopResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  /** `null` only for a hop with no body at all (a 204, a HEAD-like response) — never for an
   * empty-but-present one, which is a zero-length stream instead. */
  body: ReadableStream<Uint8Array> | null;
}

/** The ordinary path: an unpinned hop (`https:`, a literal IP, or a bypassed check) goes out
 * through the global `fetch`, letting it resolve and connect however it normally would. */
async function issueViaFetch(url: URL, signal: AbortSignal): Promise<HopResponse> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { ...REQUEST_HEADERS },
    signal,
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body: response.body,
  };
}

/**
 * The pinned path: an `http:` hop whose domain name {@link assertAllowedUrl} already resolved and
 * validated. Dials `pinnedAddress` directly via `node:http` — bypassing whatever a second,
 * independent `fetch`-internal resolution of `url.hostname` would land on — while still sending
 * `url.host` as the `Host` header, so the server sees the request exactly as it would have
 * without pinning. See `README.md`'s "IP pinning" section for why this needs `node:http` rather
 * than `fetch` (Bun's `fetch` has no connect-target override; Node's `fetch` ignores a `host`
 * header set this way, verified directly — only `node:http.request`'s `host`/`headers.host` split
 * behaves the same on both runtimes).
 */
export async function issueViaPinnedAddress(
  url: URL,
  pinnedAddress: string,
  signal: AbortSignal,
): Promise<HopResponse> {
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = httpRequest({
      host: pinnedAddress,
      port: effectivePort(url),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { ...REQUEST_HEADERS, host: url.host },
      signal,
    });
    req.on("response", resolve);
    req.on("error", reject);
    req.end();
  });

  return {
    status: response.statusCode ?? 0,
    location: response.headers.location ?? null,
    contentType: response.headers["content-type"] ?? null,
    // `IncomingMessage` is a Node `Readable`; converted to the same `ReadableStream<Uint8Array>`
    // shape `issueViaFetch`'s `response.body` already is, so `readCapped` needs no second version.
    body: Readable.toWeb(response) as ReadableStream<Uint8Array>,
  };
}

/**
 * Fetches `url`, following redirects one hop at a time with {@link assertAllowedUrl} applied
 * before each request.
 *
 * A non-2xx status is **returned**, not thrown — a 404 or a 403 is information the model asked
 * for, the same way `createBashTool` reports a non-zero exit code as data. Transport failures
 * (timeout, DNS, connection refused, a redirect loop, a blocked address) do throw: unlike a
 * status code they carry no content to report.
 */
export async function fetchGuardedUrl(
  url: URL,
  options: GuardedFetchOptions,
): Promise<GuardedFetchResult> {
  const deadline = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;

  const redirects: string[] = [];
  let current = url;

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const { pinnedAddress } = await assertAllowedUrl(current, options.policy);

    let response: HopResponse;
    try {
      response = pinnedAddress
        ? await issueViaPinnedAddress(current, pinnedAddress, signal)
        : await issueViaFetch(current, signal);
    } catch (cause) {
      throw transportFailure("Fetching", current, options, deadline, cause);
    }

    if (REDIRECT_STATUSES.has(response.status) && response.location !== null) {
      // Nothing here needs the redirect's body, and an unread body holds the connection open.
      // The rejection is discarded for the same reason as in `readCapped`: a failed cancel on a
      // body we are about to abandon has no effect on the fetch that follows.
      await response.body?.cancel().catch(() => {});
      const next = resolveLocation(response.location, current);
      redirects.push(next.href);
      current = next;
      continue;
    }

    if (response.body === null) {
      // A 204/304 or a HEAD-like empty response: no body to read, which is not an error.
      return {
        finalUrl: current.href,
        status: response.status,
        contentType: response.contentType,
        body: new Uint8Array(0),
        truncated: false,
        redirects,
      };
    }

    let read;
    try {
      read = await readCapped(response.body, options.maxBytes);
    } catch (cause) {
      throw transportFailure("Reading", current, options, deadline, cause);
    }

    return {
      finalUrl: current.href,
      status: response.status,
      contentType: response.contentType,
      body: read.bytes,
      truncated: read.truncated,
      redirects,
    };
  }

  throw new AdlError(
    "INVALID_INPUT",
    `"${url.href}" redirected more than ${options.maxRedirects} times ` +
      `(${redirects.join(" -> ")}); refusing to follow further.`,
  );
}
