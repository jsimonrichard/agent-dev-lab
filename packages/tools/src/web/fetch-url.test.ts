import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Socket } from "node:net";

import { createFetchUrlTool, type FetchUrlResult, type FetchUrlToolOptions } from "./tools.ts";

/**
 * End-to-end `fetchUrl` tests against a **local fixture server**, never a real host — a suite
 * that reaches the internet is a flaky suite, and these have to pass in CI.
 *
 * `node:test`, not `bun:test`, and wired into `package.json`'s `test:node` so both runtimes run
 * them: redirect handling (`redirect: "manual"`), streaming body reads and `AbortSignal`
 * composition are exactly the "Bun and Node can disagree" category `AGENTS.md` describes.
 *
 * **How the fixture gets past the address guard, and why that still tests it.** The fixture
 * listens on `127.0.0.1` — a literal loopback address the guard blocks by default (see
 * `address-policy.ts`'s module doc comment: checked regardless of scheme, since no DNS is
 * involved) — so its own origin goes in `allowedUrls` as a `${origin}/**` glob exempting the
 * whole origin. Because that exemption is matched *per redirect hop*, a fixture response that
 * redirects to `169.254.169.254`, or even to loopback on a **different port**, lands on a hop
 * that is not exempt and is refused by the same guard that would refuse it in production. The
 * single-URL cases this exercises only through a full redirect chain here — a literal private
 * address, and (separately) an `http:` domain resolving privately — are unit-tested directly, no
 * redirect or fixture needed, in `address-policy.test.ts`, which also proves an `https:` domain
 * is never checked this way at all. The path/regex-scoped forms of `allowedUrls` — the precision
 * plain `hostname:port` allowlisting never had — are unit-tested there too; the "path scoping
 * end to end" block below exercises the same scoping through the full tool, not just the guard
 * in isolation.
 */

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

/** Narrows the AI SDK's `execute` return union to this tool's result, checking every field's
 * type on the way through rather than casting — so each test also asserts the result shape. */
function asFetchUrlResult(value: unknown): FetchUrlResult {
  assert.ok(value !== null && typeof value === "object", `not an object: ${String(value)}`);
  const shape = value as Record<string, unknown>;
  assert.equal(typeof shape.url, "string");
  assert.equal(typeof shape.status, "number");
  assert.ok(typeof shape.contentType === "string" || shape.contentType === null);
  assert.equal(typeof shape.content, "string");
  assert.equal(typeof shape.markdown, "boolean");
  assert.equal(typeof shape.truncated, "boolean");
  assert.ok(Array.isArray(shape.redirects));
  return value as FetchUrlResult;
}

const html = `<!doctype html>
<html><head><title>Doc</title><style>.nav { color: red }</style></head>
<body>
  <nav><a href="/other">Other</a></nav>
  <h1>Install</h1>
  <p>Run <code>bun add thing</code> to install.</p>
  <ul><li>first</li><li>second</li></ul>
  <script>window.leak = "should never reach the model";</script>
</body></html>`;

/** Writes chunks until the client goes away — a body with no end, to prove the cap stops
 * reading rather than buffering whatever the server sends. */
function endlessBody(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  let stopped = false;
  res.on("close", () => {
    stopped = true;
  });
  const chunk = "x".repeat(8 * 1024);
  const pump = (): void => {
    if (stopped || res.writableEnded) {
      return;
    }
    if (res.write(chunk)) {
      setImmediate(pump);
    } else {
      res.once("drain", pump);
    }
  };
  pump();
}

interface Fixture {
  server: Server;
  origin: string;
}

/** Starts a fixture on an ephemeral loopback port. Every socket is tracked so the stalling
 * routes below can't keep the test process alive after `after()`. */
async function startFixture(routes: (path: string, res: ServerResponse) => void): Promise<Fixture> {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    routes(req.url ?? "/", res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const closeAll = (): void => {
    for (const socket of sockets) {
      socket.destroy();
    }
  };
  server.on("close", closeAll);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

let main: Fixture;
/** A second fixture, used only to prove the per-hop exemption is port-exact. */
let other: Fixture;

before(async () => {
  other = await startFixture((path, res) => {
    if (path === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<p>second server</p>");
      return;
    }
    res.writeHead(404).end();
  });

  main = await startFixture((path, res) => {
    switch (path) {
      case "/page":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      case "/plain":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("plain body\nsecond line");
        return;
      case "/json":
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
        return;
      case "/latin1":
        res.writeHead(200, { "content-type": 'text/plain; charset="iso-8859-1"' });
        res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9])); // "café" in Latin-1
        return;
      case "/bogus-charset":
        res.writeHead(200, { "content-type": "text/plain; charset=nonsense-9000" });
        res.end("body");
        return;
      case "/png":
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return;
      case "/untyped":
        // No content-type at all. `writeHead` with no header object sends none.
        res.writeHead(200);
        res.end("mystery bytes");
        return;
      case "/missing":
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Not Found</h1><p>no such page</p>");
        return;
      case "/empty":
        res.writeHead(204).end();
        return;
      case "/large":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("y".repeat(100_000));
        return;
      case "/endless":
        endlessBody(res);
        return;
      case "/stall-headers":
        // Never responds; the connection just sits there.
        return;
      case "/stall-body":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.write("start");
        return;
      case "/to-metadata":
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      case "/to-loopback-ip":
        res.writeHead(302, { location: "http://127.0.0.1:1/nope" }).end();
        return;
      case "/to-other-port":
        res.writeHead(302, { location: `${other.origin}/page` }).end();
        return;
      case "/to-file-scheme":
        res.writeHead(302, { location: "file:///etc/passwd" }).end();
        return;
      case "/to-page":
        // Relative Location, resolved against the URL it came from.
        res.writeHead(302, { location: "/page" }).end();
        return;
      case "/loop":
        res.writeHead(302, { location: "/loop" }).end();
        return;
      case "/scoped/allowed":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("inside the scoped directory");
        return;
      case "/scoped/other":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("a sibling path under the same scope");
        return;
      case "/scoped/to-metadata":
        // Same redirect as top-level `/to-metadata`, just reachable through the scoped path —
        // for proving a path-scoped exemption doesn't loosen the per-hop redirect re-check.
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      case "/unscoped":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("outside the scoped directory");
        return;
      case "/regex-only":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("matched by pattern, not by path prefix");
        return;
      default:
        res.writeHead(404, { "content-type": "text/plain" }).end("unknown fixture route");
        return;
    }
  });
});

after(async () => {
  for (const fixture of [main, other]) {
    fixture?.server.close();
  }
});

/** Runs `fetchUrl` against the main fixture with its origin exempted. */
async function fetchPath(path: string, options: FetchUrlToolOptions = {}): Promise<FetchUrlResult> {
  const { fetchUrl } = createFetchUrlTool({ allowedUrls: [`${main.origin}/**`], ...options });
  const execute = fetchUrl.execute;
  assert.ok(execute, "fetchUrl tool has no execute");
  return asFetchUrlResult(await execute({ url: `${main.origin}${path}` }, toolCallOptions));
}

/** Runs `fetchUrl` on a raw URL with nothing in `allowedUrls` — production configuration. */
async function fetchRaw(url: string, options: FetchUrlToolOptions = {}): Promise<FetchUrlResult> {
  const { fetchUrl } = createFetchUrlTool(options);
  const execute = fetchUrl.execute;
  assert.ok(execute, "fetchUrl tool has no execute");
  return asFetchUrlResult(await execute({ url }, toolCallOptions));
}

describe("fetchUrl", () => {
  describe("content reduction", () => {
    it("returns HTML as markdown", async () => {
      const result = await fetchPath("/page");
      assert.equal(result.status, 200);
      assert.equal(result.markdown, true);
      assert.equal(result.truncated, false);
      assert.deepEqual(result.redirects, []);
      assert.match(result.content, /^# Install$/m);
      assert.match(result.content, /`bun add thing`/);
      // turndown pads list content to align under the marker, so this is `-   first`.
      assert.match(result.content, /^-\s+first$/m);
      assert.match(result.content, /^-\s+second$/m);
    });

    it("drops script and style contents instead of handing them to the model as text", async () => {
      const result = await fetchPath("/page");
      assert.doesNotMatch(result.content, /should never reach the model/);
      assert.doesNotMatch(result.content, /color: red/);
    });

    it("returns other text types unchanged, without claiming they are markdown", async () => {
      const plain = await fetchPath("/plain");
      assert.equal(plain.markdown, false);
      assert.equal(plain.content, "plain body\nsecond line");

      const json = await fetchPath("/json");
      assert.equal(json.markdown, false);
      assert.equal(json.content, '{"ok":true}');
    });

    it("honors the response's declared charset", async () => {
      const result = await fetchPath("/latin1");
      assert.equal(result.content, "café");
    });

    it("refuses a charset it cannot decode rather than returning mojibake", async () => {
      await assert.rejects(fetchPath("/bogus-charset"), /charset "nonsense-9000"/);
    });

    it("refuses binary content by naming its type", async () => {
      await assert.rejects(fetchPath("/png"), /"image\/png" is not readable text/);
    });

    it("refuses a body the server did not label", async () => {
      await assert.rejects(fetchPath("/untyped"), /no Content-Type header/);
    });

    it("returns an empty body for a 204 without treating it as an error", async () => {
      const result = await fetchPath("/empty");
      assert.equal(result.status, 204);
      assert.equal(result.content, "");
    });
  });

  describe("non-2xx statuses are data, not errors", () => {
    it("returns a 404's status and body", async () => {
      const result = await fetchPath("/missing");
      assert.equal(result.status, 404);
      assert.match(result.content, /Not Found/);
    });
  });

  describe("address guard across redirects", () => {
    it("rejects a redirect into the cloud metadata service", async () => {
      // The first hop (main.origin) is exempted; the *redirect target* — 169.254.169.254,
      // written literally in the fixture's `Location` header — is what actually gets refused,
      // so this covers the post-redirect check specifically, not the initial one.
      await assert.rejects(fetchPath("/to-metadata"), (error: Error) => {
        assert.match(error.message, /169\.254\.169\.254/);
        assert.match(error.message, /not a public address/);
        return true;
      });
    });

    it("rejects a redirect into loopback", async () => {
      await assert.rejects(fetchPath("/to-loopback-ip"), (error: Error) => {
        assert.match(error.message, /127\.0\.0\.1/);
        assert.match(error.message, /not a public address/);
        return true;
      });
    });

    it("rejects a redirect to loopback on a port that is not exempt", async () => {
      // The exemption (`${origin}/**`) is scoped to one scheme+host+port; a different port is a
      // different origin the glob doesn't cover, so an allowlisted origin cannot redirect
      // sideways into another service on the same machine.
      await assert.rejects(fetchPath("/to-other-port"), /not a public address/);
    });

    it("rejects a redirect into a non-http scheme", async () => {
      await assert.rejects(fetchPath("/to-file-scheme"), /scheme "file:" is not allowed/);
    });

    it("follows an exempt redirect and reports the chain and the final URL", async () => {
      const result = await fetchPath("/to-page");
      assert.equal(result.status, 200);
      assert.equal(result.url, `${main.origin}/page`);
      assert.deepEqual(result.redirects, [`${main.origin}/page`]);
      assert.match(result.content, /^# Install$/m);
    });

    it("refuses a redirect loop instead of following it forever", async () => {
      await assert.rejects(fetchPath("/loop", { maxRedirects: 3 }), /redirected more than 3 times/);
    });

    it("follows nothing when maxRedirects is 0", async () => {
      await assert.rejects(
        fetchPath("/to-page", { maxRedirects: 0 }),
        /redirected more than 0 times/,
      );
    });
  });

  describe("guard on the initial URL", () => {
    it("rejects non-http(s) schemes", async () => {
      for (const url of ["file:///etc/passwd", "data:text/html,<b>x</b>", "gopher://x/1"]) {
        await assert.rejects(fetchRaw(url), /is not allowed/, url);
      }
    });

    it("rejects a private address with nothing in allowedUrls", async () => {
      await assert.rejects(fetchRaw(`${main.origin}/page`), /not a public address/);
      await assert.rejects(fetchRaw("http://10.0.0.1/x"), /not a public address/);
      await assert.rejects(fetchRaw("http://169.254.169.254/"), /not a public address/);
    });

    it("rejects a malformed URL", async () => {
      await assert.rejects(fetchRaw("not a url"), /is not a valid absolute URL/);
      await assert.rejects(fetchRaw("/relative/path"), /is not a valid absolute URL/);
    });
  });

  describe("response byte cap", () => {
    it("truncates a large response at the cap", async () => {
      const result = await fetchPath("/large", { maxResponseBytes: 1000 });
      assert.equal(result.truncated, true);
      assert.equal(Buffer.byteLength(result.content, "utf8"), 1000);
    });

    it("stops reading a body that never ends, rather than buffering it", async () => {
      // If the cap were applied after buffering, this route would never let the read finish.
      const result = await fetchPath("/endless", { maxResponseBytes: 512 });
      assert.equal(result.truncated, true);
      assert.equal(Buffer.byteLength(result.content, "utf8"), 512);
    });

    it("does not mark an under-cap response truncated", async () => {
      const result = await fetchPath("/plain", { maxResponseBytes: 1000 });
      assert.equal(result.truncated, false);
    });
  });

  describe("timeout", () => {
    it("gives up on a server that never sends a response", async () => {
      await assert.rejects(
        fetchPath("/stall-headers", { timeoutMs: 300 }),
        /exceeded the 300ms timeout/,
      );
    });

    it("gives up on a body that stops mid-stream", async () => {
      await assert.rejects(
        fetchPath("/stall-body", { timeoutMs: 300 }),
        /exceeded the 300ms timeout/,
      );
    });
  });

  describe("allowedUrls path/regex scoping, end to end", () => {
    it("a glob scoped to one directory allows it and everything under it", async () => {
      const { fetchUrl } = createFetchUrlTool({ allowedUrls: [`${main.origin}/scoped/*`] });
      const execute = fetchUrl.execute;
      assert.ok(execute);

      const allowed = asFetchUrlResult(
        await execute({ url: `${main.origin}/scoped/allowed` }, toolCallOptions),
      );
      assert.equal(allowed.content, "inside the scoped directory");

      const sibling = asFetchUrlResult(
        await execute({ url: `${main.origin}/scoped/other` }, toolCallOptions),
      );
      assert.equal(sibling.content, "a sibling path under the same scope");
    });

    it("that same glob does not reach outside its own directory", async () => {
      const { fetchUrl } = createFetchUrlTool({ allowedUrls: [`${main.origin}/scoped/*`] });
      const execute = fetchUrl.execute;
      assert.ok(execute);
      await assert.rejects(
        async () => execute({ url: `${main.origin}/unscoped` }, toolCallOptions),
        /not a public address/,
      );
    });

    it("a RegExp entry scopes by pattern instead of by path prefix", async () => {
      const { fetchUrl } = createFetchUrlTool({
        allowedUrls: [new RegExp(`^${main.origin.replace(/[.]/g, "\\.")}/regex-only$`)],
      });
      const execute = fetchUrl.execute;
      assert.ok(execute);

      const matched = asFetchUrlResult(
        await execute({ url: `${main.origin}/regex-only` }, toolCallOptions),
      );
      assert.equal(matched.content, "matched by pattern, not by path prefix");

      await assert.rejects(
        async () => execute({ url: `${main.origin}/scoped/allowed` }, toolCallOptions),
        /not a public address/,
      );
    });

    it("a scoped exemption still doesn't survive a redirect to a different origin", async () => {
      // Same guarantee `address guard across redirects` exercises for the whole-origin case
      // above, repeated for a path-scoped entry: scoping the exemption more tightly doesn't
      // loosen the per-hop re-check in any way.
      const { fetchUrl } = createFetchUrlTool({ allowedUrls: [`${main.origin}/scoped/*`] });
      const execute = fetchUrl.execute;
      assert.ok(execute);
      await assert.rejects(
        async () => execute({ url: `${main.origin}/scoped/to-metadata` }, toolCallOptions),
        /not a public address/,
      );
    });
  });

  describe("option validation", () => {
    it("refuses options that would disable the protection they configure", () => {
      assert.throws(() => createFetchUrlTool({ timeoutMs: 0 }), /timeoutMs must be positive/);
      assert.throws(() => createFetchUrlTool({ timeoutMs: -1 }), /timeoutMs must be positive/);
      assert.throws(
        () => createFetchUrlTool({ maxResponseBytes: 0 }),
        /maxResponseBytes must be positive/,
      );
      assert.throws(
        () => createFetchUrlTool({ maxRedirects: -1 }),
        /maxRedirects must not be negative/,
      );
    });
  });
});
