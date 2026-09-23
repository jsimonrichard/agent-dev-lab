import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  readDashboardLogs,
  readFreshProjectState,
  writeBrokenDemoCounter,
  writeDemoCounterStepsDefault,
  type FreshProjectState,
} from "./harness";

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[browser] ${msg.text()}`);
    }
  });
});

function state(): FreshProjectState {
  return readFreshProjectState();
}

type ProjectApi = {
  meta: {
    generation: number;
    lastReloadError: string | null;
    workflows: { id: string; inputSample?: { steps?: number } }[];
  };
  config: { name: string };
};

async function fetchProject(baseURL: string): Promise<ProjectApi> {
  const response = await fetch(`${baseURL}/api/project`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GET /api/project failed: ${response.status}`);
  }
  return (await response.json()) as ProjectApi;
}

function demoCounterSampleSteps(body: ProjectApi): number | undefined {
  return body.meta.workflows.find((workflow) => workflow.id === "demo-counter")?.inputSample?.steps;
}

async function gotoDemoCounter(page: Page, baseURL: string): Promise<void> {
  await page.goto(`${baseURL}/workflows/demo-counter`);
  await expect(page.getByRole("heading", { name: "Start Workflow" })).toBeVisible();
}

async function setWorkflowInputJson(page: Page, json: string): Promise<void> {
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.insertText(json);
}

async function startRunAndWait(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/workflows\/demo-counter\/run\//, { timeout: 30_000 });
  const match = new URL(page.url()).pathname.match(/\/workflows\/demo-counter\/run\/([^/]+)/);
  if (!match?.[1]) {
    throw new Error(`run URL missing run id: ${page.url()}`);
  }
  return match[1];
}

test.describe.configure({ mode: "serial" });

test.describe("packed fresh project (Nitro + watch)", () => {
  test("scaffold files include #adl and .env.example", () => {
    const { root } = state();
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      imports?: Record<string, string>;
    };
    expect(pkg.imports?.["#adl"]).toBe("./src/adl.ts");
    expect(existsSync(path.join(root, ".env.example"))).toBe(true);
    expect(existsSync(path.join(root, "src/workflows/demo-counter.ts"))).toBe(true);
  });

  test("start demo-counter via JSON paste, reopen run, and see event log", async ({ page }) => {
    const { baseURL, root } = state();
    await gotoDemoCounter(page, baseURL);

    await setWorkflowInputJson(page, '{"steps":3}');
    const runId = await startRunAndWait(page);

    await expect(page.getByText("Workflow Output")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Copy sum" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("completed").first()).toBeVisible();

    await page.goto(`${baseURL}/workflows`);
    await expect(page.getByText("demo-counter").first()).toBeVisible();
    await page.goto(`${baseURL}/workflows/demo-counter/run/${runId}`);
    await expect(page.getByText("Workflow Output")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy sum" })).toBeVisible();

    await page.goto(`${baseURL}/events`);
    await expect(page.getByRole("heading", { name: "Event Log" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "demo-counter" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("cell", { name: "workflow_finished" }).first()).toBeVisible({
      timeout: 15_000,
    });

    expect(existsSync(path.join(root, ".data"))).toBe(true);
    const sqliteCandidates = [
      path.join(root, ".data/agent-dev-lab.sqlite"),
      path.join(root, ".data/agent-dev-lab.sqlite-wal"),
    ];
    expect(sqliteCandidates.some((candidate) => existsSync(candidate))).toBe(true);
  });

  test("start-run validation errors surface in the UI", async ({ page }) => {
    const { baseURL } = state();
    await gotoDemoCounter(page, baseURL);

    await setWorkflowInputJson(page, "{");
    await page.getByRole("button", { name: "Start run" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/workflows\/demo-counter$/);

    await setWorkflowInputJson(page, '{"steps":"nope"}');
    await page.getByRole("button", { name: "Start run" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/workflows\/demo-counter$/);
  });

  test("hot reload updates the input sample and failed reload shows a banner", async ({ page }) => {
    const { baseURL, demoCounterPath, logPath } = state();
    const logs = () => readDashboardLogs(logPath);
    expect(logs()).toContain("[adl] watching");

    await gotoDemoCounter(page, baseURL);
    await expect(page.getByText("default 3")).toBeVisible();

    const before = await fetchProject(baseURL);
    expect(demoCounterSampleSteps(before)).toBe(3);
    const generationBefore = before.meta.generation;

    await writeDemoCounterStepsDefault(demoCounterPath, 5);

    await expect
      .poll(
        async () => {
          const body = await fetchProject(baseURL);
          return demoCounterSampleSteps(body) === 5 && body.meta.lastReloadError === null
            ? body.meta.generation
            : -1;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(generationBefore);

    await expect(page.getByText("default 5")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Hot reload failed")).toHaveCount(0);

    await writeBrokenDemoCounter(demoCounterPath);

    await expect(page.getByRole("status").filter({ hasText: "Hot reload failed" })).toBeVisible({
      timeout: 30_000,
    });

    const failed = await fetchProject(baseURL);
    expect(failed.meta.lastReloadError).toBeTruthy();
    expect(demoCounterSampleSteps(failed)).toBe(5);

    await writeDemoCounterStepsDefault(demoCounterPath, 5);

    await expect
      .poll(async () => (await fetchProject(baseURL)).meta.lastReloadError, {
        timeout: 30_000,
      })
      .toBeNull();

    await expect(page.getByText("Hot reload failed")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("default 5")).toBeVisible();
  });
});
