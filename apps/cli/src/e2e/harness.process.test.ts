import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { allocatePort, launchDashboardProcess } from "./harness";

describe("launchDashboardProcess", () => {
  let cwd: string | undefined;

  afterEach(async () => {
    if (cwd) {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
      cwd = undefined;
    }
  });

  it(
    "disposes a SIGTERM-ignoring child without hanging the test",
    async () => {
      cwd = await mkdtemp(path.join(tmpdir(), "adl-dashboard-proc-"));
      const port = await allocatePort();
      const script = `
        const http = require("node:http");
        process.on("SIGTERM", () => {});
        process.on("SIGINT", () => {});
        http.createServer((req, res) => {
          if (req.url === "/api/project") {
            res.end("ok");
            return;
          }
          res.statusCode = 404;
          res.end();
        }).listen(${port}, "127.0.0.1");
      `;

      const dashboard = await launchDashboardProcess({
        cwd,
        argv: ["node", "-e", script],
        port,
        readyTimeoutMs: 10_000,
      });

      const started = Date.now();
      await dashboard.dispose();
      expect(Date.now() - started).toBeLessThan(4_000);
    },
    { timeout: 15_000 },
  );
});
