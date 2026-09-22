import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
    title?: string | null;
    parentStepId?: string | null;
    retriesFromRunId?: string | null;
    replayOfRunId?: string | null;
  };
  events: Array<{ type: string; stepId?: string; name?: string }>;
};

type ListedRun = {
  runId: string;
  workflowId: string;
  status: string;
  parentWorkflowRunId?: string | null;
  parentStepId?: string | null;
  retriesFromRunId?: string | null;
  replayOfRunId?: string | null;
  title?: string | null;
};

async function startWorkflowRun(
  request: APIRequestContext,
  workflowId: string,
  options?: { title?: string },
): Promise<string> {
  const response = await request.post("/api/runs", {
    data: { workflowId, input: {}, title: options?.title },
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

async function listRuns(request: APIRequestContext): Promise<ListedRun[]> {
  const response = await request.get("/api/runs?rootsOnly=false");
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { runs: ListedRun[] };
  return body.runs;
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

function stepIdByName(run: RunPayload, name: string): string {
  const started = run.events.find((e) => e.type === "step_started" && e.name === name);
  expect(started?.stepId, `missing step_started for ${name}`).toBeTruthy();
  return started!.stepId!;
}

async function openWorkflowRun(page: Page, workflowId: string, runId: string): Promise<void> {
  await page.goto(`/workflows/${workflowId}/run/${runId}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

async function waitForTreeHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const row = document.querySelector("[data-row-id]");
    if (!row) return false;
    return Object.keys(row).some((key) => key.startsWith("__reactFiber"));
  });
}

test.describe("attempt-lineage resumability", () => {
  test("UI hides Retry while the forest is still running", async ({ page, request }) => {
    const runId = await startWorkflowRun(request, "hang-for-retry", { title: "e2e hang" });
    await openWorkflowRun(page, "hang-for-retry", runId);

    await expect(page.locator("header").getByText("running", { exact: true })).toBeVisible();
    await expect(page.getByTestId("retry-workflow-run")).toHaveCount(0);

    await waitForRunStatus(request, runId, "completed");
    await page.reload();
    await expect(page.locator("header").getByText("completed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("retry-workflow-run")).toBeVisible();
  });

  test("workflow row context menu retries the whole run", async ({ page, request }) => {
    const runId = await startWorkflowRun(request, "retry-lineage", { title: "e2e workflow retry" });
    await waitForRunStatus(request, runId, "completed");
    await openWorkflowRun(page, "retry-lineage", runId);
    await waitForTreeHydration(page);

    await page.locator('[data-row-id="__workflow__"]').first().click({ button: "right" });
    const retryItem = page.getByRole("menuitem", { name: "Retry", exact: true });
    await expect(retryItem).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Retry from here" })).toHaveCount(0);
    await retryItem.click();

    await expect
      .poll(() => {
        const match = page.url().match(/\/run\/([^/?#]+)/);
        return match?.[1] !== runId ? match?.[1] : undefined;
      })
      .toBeTruthy();
    const attemptRunId = page.url().match(/\/run\/([^/?#]+)/)?.[1];
    expect(attemptRunId).toBeTruthy();
    expect(attemptRunId).not.toBe(runId);

    const attempt = await waitForRunStatus(request, attemptRunId!, "completed");
    expect(attempt.summary.retriesFromRunId).toBe(runId);
    expect(attempt.summary.title).toBe("e2e workflow retry (retry)");

    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: /^a duration/ })
      .first()
      .click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Retry from here" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Retry", exact: true })).toHaveCount(0);
  });

  test("API rejects retry while a run in the forest is still live", async ({ request }) => {
    const runId = await startWorkflowRun(request, "hang-for-retry");
    await expect
      .poll(async () =>
        (await fetchRun(request, runId)).events.some(
          (e) => e.type === "step_started" && e.name === "before",
        ),
      )
      .toBe(true);
    const stepId = stepIdByName(await fetchRun(request, runId), "before");

    const response = await request.post(`/api/runs/${runId}/retry`, {
      data: { stepId },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/still running/i);

    await waitForRunStatus(request, runId, "completed");
  });

  test("API retry seeds a new attempt with retriesFromRunId", async ({ request }) => {
    const runId = await startWorkflowRun(request, "retry-lineage", { title: "e2e lineage" });
    const settled = await waitForRunStatus(request, runId, "completed");
    const stepId = stepIdByName(settled, "b");

    const response = await request.post(`/api/runs/${runId}/retry`, {
      data: { stepId },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as { runId: string; workflowId: string };
    expect(body.runId).not.toBe(runId);
    expect(body.workflowId).toBe("retry-lineage");

    const attempt = await waitForRunStatus(request, body.runId, "completed");
    expect(attempt.summary.retriesFromRunId).toBe(runId);
    expect(attempt.summary.title).toBe("e2e lineage (retry)");
  });

  test("API retry patches nested replay parentStepId under a re-executing spawn", async ({
    request,
  }) => {
    const runId = await startWorkflowRun(request, "retry-nested-lineage", {
      title: "e2e nested",
    });
    const settled = await waitForRunStatus(request, runId, "completed");
    const targetStepId = stepIdByName(settled, "target");

    const response = await request.post(`/api/runs/${runId}/retry`, {
      data: { stepId: targetStepId },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as { runId: string };

    const attempt = await waitForRunStatus(request, body.runId, "completed");
    expect(attempt.summary.retriesFromRunId).toBe(runId);

    const children = (await listRuns(request)).filter((r) => r.parentWorkflowRunId === body.runId);
    expect(children.length).toBeGreaterThan(0);
    const replayed = children.find((c) => c.replayOfRunId != null);
    expect(replayed, "expected a fully-replayed nested child").toBeTruthy();
    expect(replayed!.parentStepId).toBeTruthy();

    const container = attempt.events.find(
      (e) => e.type === "step_started" && e.name === "container",
    );
    expect(container?.stepId).toBeTruthy();
    expect(replayed!.parentStepId).toBe(container!.stepId);
  });
});
