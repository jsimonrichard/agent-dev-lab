import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/fresh-project",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e/fresh-project/global-setup.ts",
  globalTeardown: "./e2e/fresh-project/global-teardown.ts",
  reporter: process.env.CI ? "github" : "list",
  use: {
    // baseURL is set per-test from the global-setup state file (dynamic port).
    browserName: "chromium",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
