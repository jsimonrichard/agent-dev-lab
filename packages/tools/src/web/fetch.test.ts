import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { issueViaPinnedAddress } from "./fetch.ts";

/**
 * Unit tests for `issueViaPinnedAddress` — the `node:http` transport `fetchGuardedUrl` uses for a
 * hop `assertAllowedUrl` has pinned. Tested directly rather than through `fetchGuardedUrl`/
 * `fetchUrl` because pinning only ever fires for a genuinely public address (see
 * `address-policy.ts`), which a local, network-free fixture can never be classified as — so there
 * is no way to reach this path through the real gate without hitting a real host. What the gate
 * decides *when* to pin is `address-policy.test.ts`'s job; this file only covers what pinning
 * *does* once a caller hands it an address.
 */

let server: Server;
let origin: string;
let lastHost: string | undefined;

before(async () => {
  server = createServer((req, res) => {
    lastHost = req.headers.host;
    respond(req.url ?? "/", res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function respond(path: string, res: ServerResponse): void {
  switch (path) {
    case "/page":
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("pinned body");
      return;
    case "/redirect":
      res.writeHead(302, { location: "/page" }).end();
      return;
    case "/stall":
      // Never responds — for proving the signal aborts a pinned request too.
      return;
    default:
      res.writeHead(404).end();
      return;
  }
}

describe("issueViaPinnedAddress", () => {
  it("connects to the pinned address, not to the URL's own (unresolvable) hostname", async () => {
    // "does-not-resolve.invalid" is never dialed — if this connected via the URL's hostname
    // instead of `pinnedAddress`, it would fail on DNS before ever reaching the fixture.
    const port = new URL(origin).port;
    const url = new URL(`http://does-not-resolve.invalid:${port}/page`);
    const response = await issueViaPinnedAddress(url, "127.0.0.1", AbortSignal.timeout(5000));
    assert.equal(response.status, 200);
  });

  it("sends the URL's own host as the Host header, not the pinned address", async () => {
    const port = new URL(origin).port;
    const url = new URL(`http://my-hostname.example:${port}/page`);
    await issueViaPinnedAddress(url, "127.0.0.1", AbortSignal.timeout(5000));
    assert.equal(lastHost, `my-hostname.example:${port}`);
  });

  it("reports status, location, and content-type the same way issueViaFetch's shape expects", async () => {
    const redirect = await issueViaPinnedAddress(
      new URL(`${origin}/redirect`),
      "127.0.0.1",
      AbortSignal.timeout(5000),
    );
    assert.equal(redirect.status, 302);
    assert.equal(redirect.location, "/page");

    const page = await issueViaPinnedAddress(
      new URL(`${origin}/page`),
      "127.0.0.1",
      AbortSignal.timeout(5000),
    );
    assert.equal(page.contentType, "text/plain; charset=utf-8");
  });

  it("streams a readable body compatible with readCapped's ReadableStream reader", async () => {
    const response = await issueViaPinnedAddress(
      new URL(`${origin}/page`),
      "127.0.0.1",
      AbortSignal.timeout(5000),
    );
    assert.ok(response.body !== null);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value);
    }
    assert.equal(text, "pinned body");
  });

  it("aborts a stalled pinned request when the signal fires", async () => {
    await assert.rejects(
      issueViaPinnedAddress(new URL(`${origin}/stall`), "127.0.0.1", AbortSignal.timeout(200)),
    );
  });
});
