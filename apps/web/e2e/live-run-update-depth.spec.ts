import { expect, test, type APIRequestContext } from "@playwright/test";

type RunPayload = {
  summary: { runId: string; status: string };
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

/**
 * Live run pages used to hit max-update-depth from the URL→selection effect
 * depending on `view.steps` identity (new array every SSE event), and a
 * Date.now() hydration mismatch on duration labels.
 */
test("live tick-burst run does not max-update-depth or hydrate-mismatch", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const g = globalThis as typeof globalThis & { __adlUiErrors?: string[] };
    g.__adlUiErrors = [];
    const push = (value: unknown) => {
      const text = String(value);
      if (text.includes("Maximum update depth") || text.includes("Hydration failed")) {
        g.__adlUiErrors!.push(text.slice(0, 400));
      }
    };
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      for (const arg of args) push(arg);
      origError(...args);
    };
    window.addEventListener("error", (event) => push(event.message));
  });

  const runId = await startWorkflowRun(request, "tick-burst");
  // domcontentloaded — don't wait for the burst to finish before hydrating.
  await page.goto(`/workflows/tick-burst/run/${runId}`, { waitUntil: "domcontentloaded" });

  await expect
    .poll(
      async () => {
        const run = await fetchRun(request, runId);
        return run.summary.status;
      },
      { timeout: 30_000 },
    )
    .toBe("completed");

  await page.waitForTimeout(500);
  const errors = await page.evaluate(
    () => (globalThis as typeof globalThis & { __adlUiErrors?: string[] }).__adlUiErrors ?? [],
  );
  expect(errors, errors.join("\n\n")).toEqual([]);
});
