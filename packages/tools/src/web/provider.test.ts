import { describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import { createWebToolProvider, type WebToolProviderContext } from "./provider.ts";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
} from "./tools.ts";

/**
 * `bun:test`, matching `file/provider.test.ts` and `bash/provider.test.ts`: a provider is
 * per-call config resolution, with none of the `fetch`/`AbortSignal` surface that puts
 * `address-policy.test.ts` and `fetch-url.test.ts` on `node:test`. Nothing here reaches the
 * network — the one behavioral case is refused by the guard before a connection is attempted.
 */

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
        allowedHosts: [],
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

  it("declares a contextSchema matching the fields getTools actually reads", () => {
    const provider = createWebToolProvider();
    const parsed = provider.contextSchema?.parse({
      allowedHosts: ["docs.internal:443"],
      timeoutMs: 1_000,
      maxResponseBytes: 2_000,
      maxRedirects: 3,
    });
    expect(parsed).toEqual({
      allowedHosts: ["docs.internal:443"],
      timeoutMs: 1_000,
      maxResponseBytes: 2_000,
      maxRedirects: 3,
    });
  });

  it("uses options as the defaults when context sets none", async () => {
    const provider = createWebToolProvider({
      allowedHosts: ["docs.internal:443"],
      timeoutMs: 111,
      maxResponseBytes: 222,
      maxRedirects: 3,
    });
    const { describeWebEnv } = await provider.getTools(ctx());
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedHosts: ["docs.internal:443"],
        timeoutMs: 111,
        maxResponseBytes: 222,
        maxRedirects: 3,
      },
    });
  });

  it("overrides each option with its toolProviderContext counterpart per call", async () => {
    const provider = createWebToolProvider({
      allowedHosts: ["docs.internal:443"],
      timeoutMs: 111,
      maxResponseBytes: 222,
      maxRedirects: 3,
    });
    const { describeWebEnv } = await provider.getTools(
      ctx({
        allowedHosts: ["other.internal:8080"],
        timeoutMs: 999,
        maxResponseBytes: 888,
        maxRedirects: 7,
      }),
    );
    const result = await describeWebEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedHosts: ["other.internal:8080"],
        timeoutMs: 999,
        maxResponseBytes: 888,
        maxRedirects: 7,
      },
    });
  });

  it("carries the resolved allowedHosts into the fetchUrl tool, not just the description", async () => {
    const provider = createWebToolProvider();
    const { fetchUrl } = await provider.getTools(ctx({ allowedHosts: ["127.0.0.1:9"] }));

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

  it("rejects a non-public URL when nothing is exempted", async () => {
    const provider = createWebToolProvider();
    const { fetchUrl } = await provider.getTools(ctx());
    await expect(
      fetchUrl.execute?.({ url: "http://169.254.169.254/latest/meta-data/" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);
  });
});
