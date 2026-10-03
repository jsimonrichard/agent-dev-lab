import { expect, test, type APIRequestContext } from "@playwright/test";

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[browser] ${msg.text()}`);
    }
  });
});

type RunPayload = {
  summary: {
    runId: string;
    workflowId: string;
    status: string;
    suspendHandleId?: string;
  };
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

async function waitForRunStatus(
  request: APIRequestContext,
  runId: string,
  status: string,
): Promise<RunPayload> {
  let last: RunPayload | undefined;
  await expect
    .poll(
      async () => {
        last = await fetchRun(request, runId);
        return last.summary.status;
      },
      { timeout: 30_000 },
    )
    .toBe(status);
  return last!;
}

test("inspector can allow a suspended run to completion", async ({ page, request }) => {
  const runId = await startWorkflowRun(request, "suspend-approval");
  const parked = await waitForRunStatus(request, runId, "suspended");
  expect(parked.summary.suspendHandleId).toBeTruthy();

  await page.goto(`/workflows/suspend-approval/run/${runId}`);
  await expect(page.getByTestId("run-suspended-banner")).toBeVisible();
  await page.getByTestId("resolve-suspend-allow").click();
  await waitForRunStatus(request, runId, "completed");
  await expect(page.getByTestId("run-suspended-banner")).toHaveCount(0);
});
