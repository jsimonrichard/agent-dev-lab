import { AdlError } from "@agent-dev-lab/core";

import { assertAllowedUrl, type AddressPolicy } from "./address-policy.ts";

/**
 * The transport half of `fetchUrl`: follows redirects **by hand** so the SSRF guard runs on every
 * hop, reads the body under a byte cap, and bounds the whole operation with one timeout.
 *
 * **Why manual redirects.** `fetch(url, { redirect: "follow" })` resolves each hop inside the
 * runtime, where no policy of ours can see it — a public host that 302s to `169.254.169.254`
 * would be fetched before we ever got a `Response`. `redirect: "manual"` hands back the 3xx
 * itself, so `assertAllowedUrl` runs against each `Location` before it is requested. That makes
 * the post-redirect case the *same* check as the initial one rather than a second code path
 * (house rule 3).
 *
 * **One timeout for everything.** The deadline is a single `AbortSignal` spanning DNS, every
 * redirect hop and the body read, so a server that dribbles bytes forever cannot outlast it by
 * staying under a per-hop limit. It is composed with the caller's own `abortSignal` via
 * `AbortSignal.any`, so an aborted agent run cancels an in-flight fetch immediately.
 *
 * **The cap is enforced while reading, not after.** The body is pulled a chunk at a time and the
 * stream is cancelled the moment the cap is reached, so an oversized (or endless) response never
 * gets buffered past `maxBytes`. `Response.text()`/`arrayBuffer()` would buffer the whole body
 * first and only then let us measure it, which is the failure mode the cap exists to prevent.
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
 * Reads at most `maxBytes` from `body`, cancelling the stream as soon as the cap is hit.
 *
 * Not `process-channel.ts`'s `truncatingAppend`: that one keeps draining a subprocess's pipes
 * after the cap because a child that cannot write blocks, whereas here the correct response to
 * hitting the cap is to stop pulling and let the connection go — different behavior, so sharing
 * one helper would mean a flag deciding which, and `src/bash/` is out of this change's scope.
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
    // Releases the connection whether we finished, capped out, or threw. Cancelling a stream
    // that is already closed or already errored rejects, and this runs on the throwing path too
    // — so the rejection is discarded deliberately: propagating it out of a `finally` would
    // replace the real failure with a cleanup artifact. Nothing is being hidden, because a
    // failed cancel has no consequence beyond a connection the runtime reclaims anyway.
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
 * Returns the error to throw for a transport failure. Both places that can hit one — issuing the
 * request and reading the body — classify it here rather than each deciding for itself, so the
 * two cannot drift apart (house rule 3).
 *
 * The deadline firing is the one failure with a specific, actionable explanation. A caller-side
 * abort is returned untouched, so an agent run's own cancellation is never disguised as a fetch
 * problem.
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
    await assertAllowedUrl(current, options.policy);

    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { ...REQUEST_HEADERS },
        signal,
      });
    } catch (cause) {
      throw transportFailure("Fetching", current, options, deadline, cause);
    }

    const location = response.headers.get("location");
    if (REDIRECT_STATUSES.has(response.status) && location !== null) {
      // Nothing here needs the redirect's body, and an unread body holds the connection open.
      // The rejection is discarded for the same reason as in `readCapped`: a failed cancel on a
      // body we are about to abandon has no effect on the fetch that follows.
      await response.body?.cancel().catch(() => {});
      const next = resolveLocation(location, current);
      redirects.push(next.href);
      current = next;
      continue;
    }

    const contentType = response.headers.get("content-type");
    if (response.body === null) {
      // A 204/304 or a HEAD-like empty response: no body to read, which is not an error.
      return {
        finalUrl: current.href,
        status: response.status,
        contentType,
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
      contentType,
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
