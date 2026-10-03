import { expect, test, type APIRequestContext } from "@playwright/test";

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[browser] ${msg.text()}`);
    }
  });
});

type RunPayload = {
  summary: { runId: string; status: string };
  events: Array<{ type: string }>;
};

async function startWorkflowRun(request: APIRequestContext, workflowId: string): Promise<string> {
  const response = await request.post("/api/runs", {
    data: { workflowId, input: {} },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { runId: string };
  expect(body.runId).toBeTruthy();
  return body.runId;
}

async function fetchRun(request: APIRequestContext, runId: string): Promise<RunPayload> {
  const response = await request.get(`/api/runs/${runId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as RunPayload;
}

test("pause a live run from the inspector and continue", async ({ page, request }) => {
  const runId = await startWorkflowRun(request, "slow-steps");
  const pauseResponse = await request.post(`/api/runs/${runId}/debug/pause`);
  expect(pauseResponse.ok(), await pauseResponse.text()).toBeTruthy();

  await page.goto(`/workflows/slow-steps/run/${runId}`, { waitUntil: "domcontentloaded" });

  await expect
    .poll(
      async () => {
        const run = await fetchRun(request, runId);
        return run.events.some((event) => event.type === "workflow_suspended");
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await expect(page.getByTestId("debug-continue")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Paused", { exact: false }).first()).toBeVisible();
  await page.getByTestId("debug-continue").click();

  await expect
    .poll(
      async () => {
        const run = await fetchRun(request, runId);
        return run.summary.status;
      },
      { timeout: 20_000 },
    )
    .toBe("completed");
});
