import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Local INP bench for the run tree/waterfall — not part of CI.
 * Run: `cd apps/web && bunx playwright test e2e/workflow-tree-inp.bench.spec.ts`
 *
 * Compares interaction event-timing durations on a synthetic 10×8 step tree
 * (90 step rows × dual pane). Label via ADL_INP_LABEL (default: current).
 */

test.beforeEach(({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[browser] ${msg.text()}`);
    }
  });
});

type RunPayload = {
  summary: { runId: string; workflowId: string; status: string };
};

async function startWideTree(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/runs", {
    data: {
      workflowId: "wide-tree",
      input: { groups: 10, leavesPerGroup: 8 },
      title: "INP bench wide-tree",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { runId: string };
  return body.runId;
}

async function waitSettled(request: APIRequestContext, runId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/runs/${runId}`);
        expect(response.ok()).toBeTruthy();
        const body = (await response.json()) as RunPayload;
        return body.summary.status;
      },
      { timeout: 30_000 },
    )
    .toBe("completed");
}

type TimingSample = {
  name: string;
  duration: number;
  interactionId?: number;
};

async function waitForTreeHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const row = document.querySelector("[data-row-id]");
    if (!row) return false;
    return Object.keys(row).some((key) => key.startsWith("__reactFiber"));
  });
}

async function installEventTiming(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __adlInpSamples?: TimingSample[];
      __adlInpPo?: PerformanceObserver;
    };
    w.__adlInpSamples = [];
    w.__adlInpPo?.disconnect();
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEntry & {
          interactionId?: number;
          name: string;
          duration: number;
        };
        w.__adlInpSamples!.push({
          name: eventEntry.name,
          duration: eventEntry.duration,
          interactionId: eventEntry.interactionId,
        });
      }
    });
    // durationThreshold 0 requires Chromium; captures short interactions too.
    po.observe({ type: "event", buffered: true, durationThreshold: 0 } as PerformanceObserverInit);
    w.__adlInpPo = po;
  });
}

async function readSamples(page: Page): Promise<TimingSample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __adlInpSamples?: TimingSample[] };
    return [...(w.__adlInpSamples ?? [])];
  });
}

function summarize(
  samples: TimingSample[],
  interactionName: string,
): {
  count: number;
  maxMs: number;
  p95Ms: number;
  meanMs: number;
} {
  const durations = samples
    .filter((s) => s.name === interactionName || interactionName === "*")
    .map((s) => s.duration)
    .sort((a, b) => a - b);
  if (durations.length === 0) {
    return { count: 0, maxMs: 0, p95Ms: 0, meanMs: 0 };
  }
  const meanMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95Ms = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]!;
  return {
    count: durations.length,
    maxMs: durations[durations.length - 1]!,
    p95Ms,
    meanMs,
  };
}

async function treeDomStats(page: Page): Promise<{
  rowNodes: number;
  collapseButtons: number;
  tooltipTriggers: number;
  contextMenuRoots: number;
}> {
  return page.evaluate(() => {
    return {
      rowNodes: document.querySelectorAll("[data-row-id]").length,
      collapseButtons: document.querySelectorAll(
        'button[aria-label^="Collapse"], button[aria-label^="Expand"]',
      ).length,
      tooltipTriggers: document.querySelectorAll(
        "[data-slot='tooltip-trigger'], [data-radix-tooltip-trigger]",
      ).length,
      contextMenuRoots:
        document.querySelectorAll("[data-radix-menu-content], [data-slot='context-menu-trigger']")
          .length || document.querySelectorAll("[data-state][data-radix-collection-item]").length,
    };
  });
}

test.describe("workflow tree INP bench", () => {
  test("measure collapse / select / contextmenu on wide tree", async ({ page, request }) => {
    test.setTimeout(120_000);
    const label = process.env.ADL_INP_LABEL ?? "current";
    const runId = await startWideTree(request);
    await waitSettled(request, runId);

    await page.goto(`/workflows/wide-tree/run/${runId}`);
    await expect(page.getByText("group-00", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await waitForTreeHydration(page);
    await page.waitForTimeout(800);
    await installEventTiming(page);

    const beforeStats = await treeDomStats(page);

    // Probe whether collapse toggles under ContextMenuTrigger (nested button).
    const collapseProbe = await page.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label="Collapse group-00"]',
      ) as HTMLButtonElement | null;
      if (!btn) return { found: false as const };
      const before = btn.getAttribute("aria-expanded");
      btn.click();
      const afterClick = btn.getAttribute("aria-expanded");
      return {
        found: true as const,
        before,
        afterClick,
        // Read again after a frame — startTransition may defer.
        afterFrame: null as string | null,
      };
    });
    await page.waitForTimeout(200);
    const collapseProbeAfter = await page.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label^="Collapse group-00"], button[aria-label^="Expand group-00"]',
      );
      return {
        ariaLabel: btn?.getAttribute("aria-label") ?? null,
        ariaExpanded: btn?.getAttribute("aria-expanded") ?? null,
      };
    });

    await installEventTiming(page);

    // Prefer select interactions (row text button) — reliable under ContextMenu.
    const selectSamples: TimingSample[] = [];
    for (let i = 0; i < 10; i++) {
      const g = String(i % 10).padStart(2, "0");
      await page
        .getByRole("button", { name: new RegExp(`^group-${g} duration`) })
        .first()
        .click();
      await page.waitForTimeout(40);
    }
    selectSamples.push(...(await readSamples(page)));

    await installEventTiming(page);
    const collapseSamples: TimingSample[] = [];
    for (let i = 0; i < 8; i++) {
      const g = String(i).padStart(2, "0");
      await page.evaluate((group) => {
        const btn = document.querySelector(
          `button[aria-label="Collapse group-${group}"], button[aria-label="Expand group-${group}"]`,
        ) as HTMLButtonElement | null;
        btn?.click();
      }, g);
      await page.waitForTimeout(40);
    }
    collapseSamples.push(...(await readSamples(page)));

    await installEventTiming(page);
    const contextSamples: TimingSample[] = [];
    for (let i = 0; i < 5; i++) {
      const g = String(i).padStart(2, "0");
      await page
        .getByRole("button", { name: new RegExp(`^group-${g} duration`) })
        .first()
        .click({
          button: "right",
        });
      await page.waitForTimeout(60);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(30);
    }
    contextSamples.push(...(await readSamples(page)));

    // Long-animation-frame / interaction latency fallback via performance.now bracketing.
    const bracketed: Record<string, number[]> = { select: [], collapse: [], contextmenu: [] };
    for (let i = 0; i < 5; i++) {
      const g = String(i).padStart(2, "0");
      const selectMs = await page.evaluate(async (group) => {
        const btn = document.querySelector(
          `button[aria-label^="group-${group} duration"]`,
        ) as HTMLButtonElement | null;
        if (!btn) return -1;
        const t0 = performance.now();
        btn.click();
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        return performance.now() - t0;
      }, g);
      bracketed.select.push(selectMs);

      const collapseMs = await page.evaluate(async (group) => {
        const btn = document.querySelector(
          `button[aria-label="Collapse group-${group}"], button[aria-label="Expand group-${group}"]`,
        ) as HTMLButtonElement | null;
        if (!btn) return -1;
        const t0 = performance.now();
        btn.click();
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        return performance.now() - t0;
      }, g);
      bracketed.collapse.push(collapseMs);

      const ctxMs = await page.evaluate(async (group) => {
        const btn = document.querySelector(
          `button[aria-label^="group-${group} duration"]`,
        ) as HTMLButtonElement | null;
        if (!btn) return -1;
        const t0 = performance.now();
        btn.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
        );
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        return performance.now() - t0;
      }, g);
      bracketed.contextmenu.push(ctxMs);
      await page.keyboard.press("Escape");
    }

    const afterStats = await treeDomStats(page);

    const avg = (xs: number[]) => {
      const ok = xs.filter((n) => n >= 0);
      if (ok.length === 0) return null;
      return ok.reduce((a, b) => a + b, 0) / ok.length;
    };

    const report = {
      label,
      tree: {
        groups: 10,
        leavesPerGroup: 8,
        expectedStepRows: 10 + 10 * 8,
      },
      collapseProbe: { ...collapseProbe, afterWait: collapseProbeAfter },
      dom: { before: beforeStats, after: afterStats },
      eventTiming: {
        collapse: summarize(collapseSamples, "click"),
        select: summarize(selectSamples, "click"),
        contextmenu: summarize(contextSamples, "contextmenu"),
        allCollapse: summarize(collapseSamples, "*"),
        allSelect: summarize(selectSamples, "*"),
        allContext: summarize(contextSamples, "*"),
      },
      bracketedRafMs: {
        selectAvg: avg(bracketed.select),
        collapseAvg: avg(bracketed.collapse),
        contextmenuAvg: avg(bracketed.contextmenu),
        raw: bracketed,
      },
      rawCounts: {
        collapse: collapseSamples.length,
        select: selectSamples.length,
        contextmenu: contextSamples.length,
      },
    };

    console.log(`\nADL_INP_REPORT ${JSON.stringify(report, null, 2)}\n`);

    expect(beforeStats.rowNodes).toBeGreaterThan(80);
  });

  test("shared menu, bar tip, and collapse keep the row actions", async ({ page, request }) => {
    const runId = await startWideTree(request);
    await waitSettled(request, runId);
    await page.goto(`/workflows/wide-tree/run/${runId}`);
    await expect(page.getByText("group-00", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await waitForTreeHydration(page);

    await page
      .getByRole("button", { name: /^group-01 duration/ })
      .first()
      .click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Retry from here" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator("[data-tip]").first().hover();
    await expect(page.getByTestId("waterfall-hover-tip")).not.toHaveText("", { timeout: 1_000 });

    const lineCount = await page.locator("span.w-px").count();
    expect(lineCount).toBeGreaterThan(4);
    expect(lineCount).toBeLessThan(40);

    const rowsBefore = await page.locator("[data-row-id]").count();
    await page.getByRole("button", { name: "Collapse group-00" }).click();
    await expect
      .poll(async () => page.locator("[data-row-id]").count(), { timeout: 3_000 })
      .toBeLessThan(rowsBefore);
  });
});
