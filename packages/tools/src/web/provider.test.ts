import { describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import { createWebToolProvider, type WebToolProviderContext } from "./provider.ts";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
} from "./tools.ts";

/** `bun:test`, matching `file/provider.test.ts` and `bash/provider.test.ts` — per-call config
 * resolution, none of the surface that puts the other `src/web/` test files on `node:test`. */

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: WebToolProviderContext,
): ExtendedToolProviderContext<WebToolProviderContext | undefined> {
  return { agentId: "test-agent", memoryScope: "test-scope", toolProviderContext };
}

describe("createWebToolProvider", () => {
  it("needs no options at all, and defaults to the strictest configuration", async () => {
    const provider = createWebToolProvider();
    const { describeWebEnv } = await provider.getTools(ctx());
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedUrls: [],
        allowPrivateNetwork: false,
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
        maxRedirects: DEFAULT_MAX_REDIRECTS,
      },
    });
  });

  it("exposes both tools with descriptions", () => {
    const provider = createWebToolProvider();
    expect(provider.listTools?.().map((summary) => summary.name)).toEqual([
      "fetchUrl",
      "describeWebEnv",
    ]);
    for (const summary of provider.listTools?.() ?? []) {
      // `ToolProviderToolSummary.description` is optional on the interface; both of these set it.
      expect(summary.description).toBeTruthy();
    }
  });

  it("declares a contextSchema accepting both glob strings and RegExp entries", () => {
    const provider = createWebToolProvider();
    const pattern = /^https:\/\/docs\.internal:443\/wiki\/[\w-]+$/;
    const parsed = provider.contextSchema?.parse({
      allowedUrls: ["https://docs.internal:443/**", pattern],
      timeoutMs: 1_000,
      maxResponseBytes: 2_000,
      maxRedirects: 3,
    });
    expect(parsed).toEqual({
      allowedUrls: ["https://docs.internal:443/**", pattern],
      timeoutMs: 1_000,
      maxResponseBytes: 2_000,
      maxRedirects: 3,
    });
  });

  it("rejects a contextSchema entry that is neither a string nor a RegExp", () => {
    const provider = createWebToolProvider();
    expect(provider.contextSchema?.safeParse({ allowedUrls: [42] }).success).toBe(false);
  });

  it("uses options as the defaults when context sets none", async () => {
    const provider = createWebToolProvider({
      allowedUrls: ["https://docs.internal:443/**"],
      timeoutMs: 111,
      maxResponseBytes: 222,
      maxRedirects: 3,
    });
    const { describeWebEnv } = await provider.getTools(ctx());
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedUrls: ["https://docs.internal:443/**"],
        allowPrivateNetwork: false,
        timeoutMs: 111,
        maxResponseBytes: 222,
        maxRedirects: 3,
      },
    });
  });

  it("overrides each option with its toolProviderContext counterpart per call", async () => {
    const provider = createWebToolProvider({
      allowedUrls: ["https://docs.internal:443/**"],
      timeoutMs: 111,
      maxResponseBytes: 222,
      maxRedirects: 3,
    });
    const { describeWebEnv } = await provider.getTools(
      ctx({
        allowedUrls: ["https://other.internal:8080/**"],
        allowPrivateNetwork: true,
        timeoutMs: 999,
        maxResponseBytes: 888,
        maxRedirects: 7,
      }),
    );
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedUrls: ["https://other.internal:8080/**"],
        allowPrivateNetwork: true,
        timeoutMs: 999,
        maxResponseBytes: 888,
        maxRedirects: 7,
      },
    });
  });

  it("reports a RegExp entry as a display string, not a serialized-away {}", async () => {
    // `JSON.stringify(/x/i)` is `"{}"` — a RegExp has no enumerable own properties — so a tool
    // result carrying one raw would silently lose exactly the information this endpoint exists
    // to report once an AI SDK turn serializes it. `describeWebEnv` must convert it instead.
    const pattern = /^https:\/\/docs\.internal:443\/wiki\/[\w-]+$/i;
    const provider = createWebToolProvider({ allowedUrls: [pattern] });
    const { describeWebEnv } = await provider.getTools(ctx());
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedUrls: [String(pattern)],
        allowPrivateNetwork: false,
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
        maxRedirects: DEFAULT_MAX_REDIRECTS,
      },
    });
    expect(JSON.parse(JSON.stringify(result)).webAccess.allowedUrls).toEqual([String(pattern)]);
  });

  it("carries the resolved allowedUrls into the fetchUrl tool, not just the description", async () => {
    const provider = createWebToolProvider();
    const { fetchUrl } = await provider.getTools(ctx({ allowedUrls: ["http://127.0.0.1:9/**"] }));

    // The exempt origin gets *past* the address check, which is the whole claim here. What
    // happens next is the connection's business and is deliberately not asserted: whether port 9
    // refuses depends on the machine, and pinning that would make this test about the
    // environment rather than about the provider wiring the allowlist through.
    let message = "";
    try {
      await fetchUrl.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/not a public address/);

    // Same host, port not exempt: refused by the address check, before any connection.
    await expect(
      fetchUrl.execute?.({ url: "http://127.0.0.1:10/x" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);
  });

  it("carries a RegExp allowedUrls entry through to the fetchUrl tool the same way", async () => {
    const provider = createWebToolProvider();
    const { fetchUrl } = await provider.getTools(
      ctx({ allowedUrls: [/^http:\/\/127\.0\.0\.1:9\/x$/] }),
    );

    let message = "";
    try {
      await fetchUrl.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/not a public address/);

    // A path the RegExp doesn't describe isn't exempted, so 127.0.0.1 — a literal loopback
    // address — is still refused. Being non-public isn't itself the problem (the case above
    // proves that); being non-public *and* uncovered by allowedUrls is.
    await expect(
      fetchUrl.execute?.({ url: "http://127.0.0.1:9/other" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);
  });

  it("rejects a URL whose hostname is a literal non-public IP address, when nothing exempts it", async () => {
    // Named precisely: there is no such thing as a "non-public URL" — only a literal address
    // written in one can be classified that way, and only when nothing in allowedUrls covers it.
    const provider = createWebToolProvider();
    const { fetchUrl } = await provider.getTools(ctx());
    await expect(
      fetchUrl.execute?.({ url: "http://169.254.169.254/latest/meta-data/" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);
  });

  it("allowPrivateNetwork defaults to false — the address check stays on unless a host opts out", async () => {
    const provider = createWebToolProvider();
    const { describeWebEnv } = await provider.getTools(ctx());
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toMatchObject({ webAccess: { allowPrivateNetwork: false } });
  });

  it("allowPrivateNetwork carries through to the fetchUrl tool, disabling the address check", async () => {
    const provider = createWebToolProvider({ allowPrivateNetwork: true });
    const { fetchUrl } = await provider.getTools(ctx());

    // Nothing listens on 127.0.0.1:9 — "connection refused" comes back immediately, fast and
    // deterministic, unlike attempting a real connection to a metadata-service-shaped address
    // that would just hang in this sandbox. Same "get past the address check" claim as the
    // allowedUrls-wiring tests above: what happens next is the connection's business and
    // deliberately not asserted.
    let message = "";
    try {
      await fetchUrl.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/not a public address/);
  });

  it("toolProviderContext.allowPrivateNetwork overrides the constructor default per call", async () => {
    const onProvider = createWebToolProvider({ allowPrivateNetwork: true });
    const { fetchUrl: onFetchUrl } = await onProvider.getTools(ctx({ allowPrivateNetwork: false }));
    await expect(
      onFetchUrl.execute?.({ url: "http://169.254.169.254/latest/meta-data/" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);

    const offProvider = createWebToolProvider({ allowPrivateNetwork: false });
    const { fetchUrl: offFetchUrl } = await offProvider.getTools(
      ctx({ allowPrivateNetwork: true }),
    );
    let message = "";
    try {
      await offFetchUrl.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/not a public address/);
  });

  it("does not exempt a scheme-rejected URL — allowPrivateNetwork only affects the address check", async () => {
    const provider = createWebToolProvider({ allowPrivateNetwork: true });
    const { fetchUrl } = await provider.getTools(ctx());
    await expect(
      fetchUrl.execute?.({ url: "file:///etc/passwd" }, toolCallOptions),
    ).rejects.toThrow(/scheme/);
  });
});
