import { z } from "zod";

import { AdlError } from "@agent-dev-lab/core";
import {
  createFetchUrlTool,
  type FetchUrlResult,
  type FetchUrlToolOptions,
} from "@agent-dev-lab/tools";

import { adl } from "#adl";

import { startFetchFixture } from "../tools/fetch-fixture";

const toolCallOptions = { toolCallId: "fetch-url-demo", messages: [] as [] };

const checkResultSchema = z.object({
  name: z.string(),
  url: z.string(),
  allowedUrls: z.array(z.string()),
  expected: z.enum(["allowed", "blocked"]),
  actual: z.enum(["allowed", "blocked"]),
  passed: z.boolean(),
  detail: z.string(),
});
type CheckResult = z.infer<typeof checkResultSchema>;

const fetchUrlDemoInput = z.object({
  probePublicUrl: z
    .string()
    .optional()
    .describe(
      "Optional real http(s) URL, fetched with the default (no allowedUrls) policy purely as " +
        "an informational probe — reachability is an environment fact (this dev machine's " +
        "network), not one of the guard behaviors under test below, so it never affects " +
        "allChecksPassed. Omit to skip it entirely.",
    ),
});

/** Narrows `fetchUrl.execute`'s AI-SDK-general return type down to this tool's own concrete
 * result — a type guard rather than a cast (house rule 2), same pattern
 * `packages/tools/src/web/fetch-url.test.ts`'s `asFetchUrlResult` uses. */
function asFetchUrlResult(value: unknown): FetchUrlResult {
  if (value === null || typeof value !== "object" || !("content" in value)) {
    throw new AdlError("INIT_FAILED", `fetchUrl returned an unexpected shape: ${String(value)}`);
  }
  return value as FetchUrlResult;
}

/**
 * Exercises `@agent-dev-lab/tools`' `fetchUrl` end to end against a local fixture
 * (`src/tools/fetch-fixture.ts`) — no LLM, no real network dependency for the checks
 * themselves, so this runs the same way in a sandboxed dev environment as anywhere else (matches
 * `demo-counter`'s "step-only demo, no LLM" precedent, applied to a tool whose entire point is a
 * security boundary rather than a conversation).
 *
 * Each check is a deterministic assertion, not prose from a model: build a `fetchUrl` tool with
 * one `allowedUrls` policy, call it against one fixture route, and compare what actually happened
 * to what the guard is supposed to do. Together they demonstrate:
 *
 * - The guard blocks the fixture (loopback) with no `allowedUrls` at all.
 * - A glob scoped to one directory (`.../scoped/*`) allows every path under it...
 * - ...and still refuses a sibling path on the very same origin outside that directory —
 *   precision plain `hostname:port` allowlisting could never express.
 * - A `RegExp` entry allows only the one path it actually describes.
 * - However broad the exemption for the fixture's own origin, a redirect to a different origin
 *   (the fixture's `/redirect-to-metadata`, which 302s to `169.254.169.254`) is still refused —
 *   the per-redirect-hop re-check holds regardless of how the exemption is expressed.
 *
 * A check behaving differently than expected is a real regression in the guard, not just
 * something to note — so `run` throws (naming every mismatch) rather than merely reporting
 * `passed: false` in a return value nobody is forced to look at (house rule 1). Every check still
 * runs to completion first, so a single mismatch doesn't hide the rest.
 */
export const fetchUrlDemo = adl.createWorkflow({
  id: "fetch-url-demo",
  inputSchema: fetchUrlDemoInput,
  outputSchema: z.object({
    fixtureOrigin: z.string(),
    checks: z.array(checkResultSchema),
    allChecksPassed: z.boolean(),
    publicProbe: z.object({
      attempted: z.boolean(),
      reachable: z.boolean(),
      detail: z.string(),
    }),
  }),
  async run(input, ctx) {
    const { probePublicUrl } = fetchUrlDemoInput.parse(input);
    await ctx.setTitle("fetchUrl demo: SSRF guard + allowedUrls scoping");

    // The fixture is a live socket, not a JSON-serializable value, so it lives here in `run`,
    // never as a `ctx.step` return value (the SQLite workflow store persists step outputs as
    // JSON — see `packages/core/src/stores/sqlite.ts`). Only the deterministic checks below are
    // individually stepped, for a per-check trace in the inspection UI.
    const fixture = await startFetchFixture();
    try {
      async function check(
        name: string,
        url: string,
        allowedUrls: FetchUrlToolOptions["allowedUrls"],
        expected: "allowed" | "blocked",
      ): Promise<CheckResult> {
        return ctx.step(name, async () => {
          const { fetchUrl } = createFetchUrlTool({ allowedUrls });
          const execute = fetchUrl.execute;
          if (!execute) {
            throw new AdlError("INIT_FAILED", "fetchUrl tool has no execute.");
          }

          let actual: "allowed" | "blocked";
          let detail: string;
          try {
            const result = asFetchUrlResult(await execute({ url }, toolCallOptions));
            actual = "allowed";
            detail = result.content.slice(0, 200);
          } catch (error) {
            actual = "blocked";
            detail = error instanceof Error ? error.message : String(error);
          }

          return {
            name,
            url,
            allowedUrls: (allowedUrls ?? []).map((pattern) => String(pattern)),
            expected,
            actual,
            passed: actual === expected,
            detail,
          };
        });
      }

      // A dot in the fixture's own hostname (`127.0.0.1`) must stay a literal dot in the regex
      // check below — same escaping `fetch-url.test.ts` uses to build a pattern from an origin.
      const escapedOrigin = fixture.origin.replace(/[.]/g, "\\.");

      const checks: CheckResult[] = [
        await check(
          "no-allowlist-blocks-the-fixture",
          `${fixture.origin}/scoped/allowed`,
          [],
          "blocked",
        ),
        await check(
          "glob-allows-its-own-scoped-path",
          `${fixture.origin}/scoped/allowed`,
          [`${fixture.origin}/scoped/*`],
          "allowed",
        ),
        await check(
          "glob-allows-a-sibling-in-the-same-scope",
          `${fixture.origin}/scoped/other`,
          [`${fixture.origin}/scoped/*`],
          "allowed",
        ),
        await check(
          "glob-blocks-a-path-outside-its-scope",
          `${fixture.origin}/unscoped`,
          [`${fixture.origin}/scoped/*`],
          "blocked",
        ),
        await check(
          "regex-allows-the-path-it-describes",
          `${fixture.origin}/regex-only`,
          [new RegExp(`^${escapedOrigin}/regex-only$`)],
          "allowed",
        ),
        await check(
          "regex-blocks-a-path-it-does-not-describe",
          `${fixture.origin}/scoped/allowed`,
          [new RegExp(`^${escapedOrigin}/regex-only$`)],
          "blocked",
        ),
        await check(
          "broad-origin-exemption-still-blocks-a-redirect-elsewhere",
          `${fixture.origin}/redirect-to-metadata`,
          [`${fixture.origin}/**`],
          "blocked",
        ),
      ];

      for (const result of checks) {
        ctx.emit("fetch-url-demo-check", { name: result.name, passed: result.passed });
      }

      const allChecksPassed = checks.every((result) => result.passed);

      const publicProbe = probePublicUrl
        ? await ctx.step("public-probe", async () => {
            const { fetchUrl } = createFetchUrlTool();
            const execute = fetchUrl.execute;
            if (!execute) {
              throw new AdlError("INIT_FAILED", "fetchUrl tool has no execute.");
            }
            try {
              await execute({ url: probePublicUrl }, toolCallOptions);
              return { attempted: true, reachable: true, detail: "reachable" };
            } catch (error) {
              return {
                attempted: true,
                reachable: false,
                detail: error instanceof Error ? error.message : String(error),
              };
            }
          })
        : { attempted: false, reachable: false, detail: "not attempted — no probePublicUrl given" };

      if (!allChecksPassed) {
        const failures = checks
          .filter((result) => !result.passed)
          .map((result) => `"${result.name}": expected ${result.expected}, got ${result.actual}`)
          .join("; ");
        throw new AdlError(
          "INIT_FAILED",
          `fetch-url-demo: the guard did not behave as expected — ${failures}`,
        );
      }

      return { fixtureOrigin: fixture.origin, checks, allChecksPassed, publicProbe };
    } finally {
      await fixture.close();
    }
  },
});
