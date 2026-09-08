import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

/**
 * A tiny local HTTP fixture for `fetch-url-demo` — never a real host, so the demo runs offline
 * and never depends on what a dev's network happens to allow. Mirrors
 * `packages/tools/src/web/fetch-url.test.ts`'s own fixture (same shape, same reason): the
 * fixture listens on loopback, which `fetchUrl`'s SSRF guard blocks by default, so reaching it
 * at all is itself part of what the demo exercises via `allowedUrls`.
 *
 * Routes, and the `allowedUrls` scoping story each one demonstrates:
 *
 * - `/scoped/allowed`, `/scoped/other` — inside `<origin>/scoped/*`.
 * - `/unscoped` — outside that glob's directory, on the very same origin.
 * - `/regex-only` — matched by a `RegExp` entry, not by a path-prefix glob.
 * - `/redirect-to-metadata` — 302s to `169.254.169.254`, a different origin the exemption for
 *   *this* origin (however broad) does not cover — the per-redirect-hop re-check.
 *
 * Not started at module load (unlike `tools/sandbox.ts`'s sandbox root): the inspection UI's dev
 * server keeps this process alive across many workflow runs, and a fixture that outlives one run
 * would leak a listening socket. `fetchUrlDemo` starts and closes one per run instead.
 */
export interface FetchFixture {
  origin: string;
  close(): Promise<void>;
}

export async function startFetchFixture(): Promise<FetchFixture> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => {
    routeFetchFixture(req.url ?? "/", res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

function routeFetchFixture(path: string, res: ServerResponse): void {
  switch (path) {
    case "/scoped/allowed":
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("inside the scoped directory");
      return;
    case "/scoped/other":
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("a sibling path under the same scope");
      return;
    case "/unscoped":
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("outside the scoped directory");
      return;
    case "/regex-only":
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("matched by pattern, not by path prefix");
      return;
    case "/redirect-to-metadata":
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      return;
    default:
      res.writeHead(404, { "content-type": "text/plain" }).end("unknown fixture route");
      return;
  }
}
