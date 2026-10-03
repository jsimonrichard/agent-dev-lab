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

type StreamingReport = {
  name: string;
  runMs: number;
  peakRowNodes: number;
  endRowNodes: number;
  domMutations: number;
  longAnimationFrames: { count: number; maxMs: number; meanMs: number };
  liveSelect: ReturnType<typeof summarize>;
  liveSelectBracketAvgMs: number | null;
};

async function measureStreamingRun(
  page: Page,
  request: APIRequestContext,
  opts: {
    name: string;
    workflowId: string;
    input: Record<string, unknown>;
    waitForText: string;
  },
): Promise<StreamingReport> {
  const started = Date.now();
  const response = await request.post("/api/runs", {
    data: {
      workflowId: opts.workflowId,
      input: opts.input,
      title: `INP stream ${opts.name}`,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { runId: string };

  await page.goto(`/workflows/${opts.workflowId}/run/${body.runId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(opts.waitForText, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.evaluate(() => {
    const w = window as unknown as {
      __adlStreamMutations?: number;
      __adlStreamMo?: MutationObserver;
      __adlStreamLoaf?: number[];
      __adlStreamPo?: PerformanceObserver;
    };
    w.__adlStreamMutations = 0;
    w.__adlStreamMo?.disconnect();
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        w.__adlStreamMutations! += record.addedNodes.length + record.removedNodes.length;
        if (record.type === "attributes" || record.type === "characterData") {
          w.__adlStreamMutations! += 1;
        }
      }
    });
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    w.__adlStreamMo = mo;
    w.__adlStreamLoaf = [];
    w.__adlStreamPo?.disconnect();
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__adlStreamLoaf!.push(entry.duration);
        }
      });
      po.observe({ type: "long-animation-frame", buffered: true } as PerformanceObserverInit);
      w.__adlStreamPo = po;
    } catch {
      // Chromium without LoAF — streaming report still has mutations + INP.
    }
  });
  await installEventTiming(page);

  const liveSelect: TimingSample[] = [];
  const bracket: number[] = [];
  for (let i = 0; i < 6; i++) {
    const selectMs = await page.evaluate(async () => {
      const btn = document.querySelector(
        'button[aria-label*="duration"]',
      ) as HTMLButtonElement | null;
      if (!btn) return -1;
      const t0 = performance.now();
      btn.click();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return performance.now() - t0;
    });
    bracket.push(selectMs);
    await page.waitForTimeout(80);
  }
  liveSelect.push(...(await readSamples(page)));

  await expect
    .poll(
      async () => {
        const run = await request.get(`/api/runs/${body.runId}`);
        expect(run.ok()).toBeTruthy();
        const payload = (await run.json()) as RunPayload;
        return payload.summary.status;
      },
      { timeout: 90_000 },
    )
    .toBe("completed");
  await page.waitForTimeout(1200);

  const stats = await page.evaluate(() => {
    const w = window as unknown as {
      __adlStreamMutations?: number;
      __adlStreamMo?: MutationObserver;
      __adlStreamLoaf?: number[];
      __adlStreamPo?: PerformanceObserver;
    };
    w.__adlStreamMo?.disconnect();
    w.__adlStreamPo?.disconnect();
    return {
      mutations: w.__adlStreamMutations ?? 0,
      loaf: [...(w.__adlStreamLoaf ?? [])],
      rowNodes: document.querySelectorAll("[data-row-id]").length,
    };
  });
  const loaf = stats.loaf.sort((a, b) => a - b);
  const loafMean = loaf.length === 0 ? 0 : loaf.reduce((a, b) => a + b, 0) / loaf.length;
  const okBracket = bracket.filter((n) => n >= 0);

  return {
    name: opts.name,
    runMs: Date.now() - started,
    peakRowNodes: stats.rowNodes,
    endRowNodes: stats.rowNodes,
    domMutations: stats.mutations,
    longAnimationFrames: {
      count: loaf.length,
      maxMs: loaf[loaf.length - 1] ?? 0,
      meanMs: loafMean,
    },
    liveSelect: summarize(liveSelect, "click"),
    liveSelectBracketAvgMs:
      okBracket.length === 0 ? null : okBracket.reduce((a, b) => a + b, 0) / okBracket.length,
  };
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

  test("measure streaming tick-burst and delayed wide-tree", async ({ page, request }) => {
    test.setTimeout(180_000);
    const label = process.env.ADL_INP_LABEL ?? "current";

    const tickBurst = await measureStreamingRun(page, request, {
      name: "tick-burst",
      workflowId: "tick-burst",
      input: {},
      waitForText: "tick",
    });

    const delayedWide = await measureStreamingRun(page, request, {
      name: "wide-tree-live",
      workflowId: "wide-tree",
      input: { groups: 10, leavesPerGroup: 8, leafDelayMs: 80 },
      waitForText: "group-00",
    });

    const report = { label, streaming: { tickBurst, delayedWide } };
    console.log(`\nADL_INP_STREAMING ${JSON.stringify(report, null, 2)}\n`);

    expect(tickBurst.domMutations).toBeGreaterThan(0);
    expect(delayedWide.peakRowNodes).toBeGreaterThan(20);
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
