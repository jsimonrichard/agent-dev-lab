import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";

import { AdlError } from "@agent-dev-lab/core";

import {
  adlProjectWatchEnvValue,
  inspectionUiViteDevArgs,
  resolveInspectionPort,
  resolveUiLaunchMode,
  shouldForwardUiChildSignals,
} from "./ui-launch";

const webRoot = path.resolve(fileURLToPath(new URL("../../web", import.meta.url)));

describe("resolveUiLaunchMode", () => {
  it("uses vite in the monorepo web tree", () => {
    expect(
      resolveUiLaunchMode({
        prebuilt: false,
        frameworkDev: false,
        webRoot,
      }),
    ).toBe("project-dev");
  });

  it("uses Nitro when the web package has no Vite tree, or when --prebuilt is set", () => {
    expect(
      resolveUiLaunchMode({
        prebuilt: false,
        frameworkDev: false,
        webRoot: "/tmp/not-a-web-package",
      }),
    ).toBe("serve");
    expect(resolveUiLaunchMode({ prebuilt: true, frameworkDev: false, webRoot })).toBe("serve");
  });
});

describe("adlProjectWatchEnvValue", () => {
  it("disables watch only when the user passed --serve", () => {
    expect(adlProjectWatchEnvValue({ serve: true })).toBe("0");
    expect(adlProjectWatchEnvValue({ serve: false })).toBe("1");
  });
});

describe("shouldForwardUiChildSignals", () => {
  it("forwards when stdin is not a TTY so kill(pid) can stop --serve", () => {
    expect(shouldForwardUiChildSignals({ isTTY: false })).toBe(true);
    expect(shouldForwardUiChildSignals({})).toBe(true);
    expect(shouldForwardUiChildSignals(undefined)).toBe(true);
  });

  it("does not forward in a TTY where the process group already got Ctrl+C", () => {
    expect(shouldForwardUiChildSignals({ isTTY: true })).toBe(false);
  });
});

describe("inspectionUiViteDevArgs", () => {
  it("pins host/port so Vite does not hop after the CLI chose a free port", () => {
    expect(inspectionUiViteDevArgs(3000)).toEqual([
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      "3000",
      "--strictPort",
    ]);
  });
});

function listen(host: string, port = 0): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ port, host, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("expected a TCP listen address"));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

describe("resolveInspectionPort", () => {
  it("returns the preferred port when loopback can bind it", async () => {
    const holder = await listen("127.0.0.1");
    const port = holder.port;
    await holder.close();
    expect(await resolveInspectionPort(port, { strictPort: false })).toBe(port);
    expect(await resolveInspectionPort(port, { strictPort: true })).toBe(port);
  });

  it("selects a later port when 127.0.0.1 is already bound", async () => {
    const holder = await listen("127.0.0.1");
    try {
      const port = await resolveInspectionPort(holder.port, { strictPort: false });
      expect(port).toBeGreaterThan(holder.port);
    } finally {
      await holder.close();
    }
  });

  it("throws when 127.0.0.1 is already bound and strictPort is set", async () => {
    const holder = await listen("127.0.0.1");
    try {
      await expect(resolveInspectionPort(holder.port, { strictPort: true })).rejects.toBeInstanceOf(
        AdlError,
      );
      await expect(resolveInspectionPort(holder.port, { strictPort: true })).rejects.toThrow(
        `Port ${holder.port} is already in use`,
      );
    } finally {
      await holder.close();
    }
  });

  it("selects a later port when only ::1 is already bound", async () => {
    let holder: { port: number; close: () => Promise<void> };
    try {
      holder = await listen("::1");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT") {
        return;
      }
      throw error;
    }
    try {
      const port = await resolveInspectionPort(holder.port, { strictPort: false });
      expect(port).toBeGreaterThan(holder.port);
    } finally {
      await holder.close();
    }
  });
});
