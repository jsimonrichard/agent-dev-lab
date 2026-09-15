import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(webRoot, "e2e/fixture");
const sqliteDir = mkdtempSync(path.join(tmpdir(), "adl-web-e2e-"));
const sqlitePath = path.join(sqliteDir, "agent-dev-lab.sqlite");

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/fixture/**",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `bun --bun vite dev --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: webRoot,
    url: `${baseURL}/api/project`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ADL_PROJECT_ROOT: fixtureRoot,
      ADL_FRAMEWORK_DEV: "0",
      ADL_SQLITE_PATH: sqlitePath,
      ADL_PROJECT_WATCH: "0",
      PORT: String(port),
      BROWSER: "none",
      NO_COLOR: "1",
    },
  },
});
