import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { launchScaffoldDashboard, runAdl, UI_FAILURE_MARKERS, waitUntil } from "./harness";
import type { ScaffoldDashboard } from "./harness";

const SETUP_TIMEOUT_MS = 180_000;

type ProjectApi = {
  root: string;
  config: { name: string; workflowIds: string[]; agentIds: string[] };
  meta: {
    lastReloadError: string | null;
    workflows: { id: string; inputSample?: { steps?: number } }[];
  };
};

type RunApi = {
  summary: { runId: string; workflowId: string; status: string };
  events: Array<{ type: string; output?: unknown; error?: unknown }>;
};

function expectHealthyHtml(body: string, extras: string[]): void {
  for (const marker of UI_FAILURE_MARKERS) {
    expect(body.includes(marker)).toBe(false);
  }
  for (const extra of extras) {
    expect(body).toContain(extra);
  }
}

describe("adl init e2e", () => {
  let harness: ScaffoldDashboard | undefined;

  beforeAll(async () => {
    harness = await launchScaffoldDashboard();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.dispose();
  });

  function dashboard(): ScaffoldDashboard {
    if (!harness) {
      throw new Error("init e2e harness did not start");
    }
    return harness;
  }

  it(
    "lists scaffold workflows and agents and runs demo-counter from the CLI",
    async () => {
      const { root } = dashboard();

      const workflows = await runAdl(["workflow", "list"], { cwd: root });
      expect(workflows.exitCode).toBe(0);
      expect(workflows.stdout).toContain("demo-counter");
      expect(workflows.stdout).toContain("ask");

      const agents = await runAdl(["agent", "list"], { cwd: root });
      expect(agents.exitCode).toBe(0);
      expect(agents.stdout).toContain("assistant");

      const run = await runAdl(["workflow", "run", "demo-counter", "--input", '{"steps":2}'], {
        cwd: root,
      });
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('"sum": 3');
      expect(run.stdout).toContain('"steps": 2');
    },
    { timeout: 30_000 },
  );

  it(
    "exposes the generated registry on GET /api/project",
    async () => {
      const { fetchJson, name, root } = dashboard();
      const { status, body } = await fetchJson<ProjectApi>("/api/project");
      expect(status).toBe(200);
      expect(body.root).toBe(root);
      expect(body.config.name).toBe(name);
      expect(body.config.agentIds).toEqual(["assistant"]);
      expect(body.config.workflowIds.sort()).toEqual(["ask", "demo-counter"]);
      expect(body.meta.lastReloadError).toBeNull();
      expect(
        body.meta.workflows.find((workflow) => workflow.id === "demo-counter")?.inputSample,
      ).toEqual({ steps: 3 });
    },
    { timeout: 30_000 },
  );

  it(
    "renders dashboard HTML for home, workflow, and agent routes",
    async () => {
      const { fetchText, name } = dashboard();
      const pages = [
        ["/", [name, "Overview"]],
        ["/workflows", ["demo-counter", "ask"]],
        ["/workflows/demo-counter", ["demo-counter"]],
        ["/agent", ["assistant"]],
        ["/agent/assistant", ["assistant"]],
      ] as const;

      for (const [pathname, extras] of pages) {
        const { status, body } = await fetchText(pathname);
        expect(status).toBe(200);
        expectHealthyHtml(body, [...extras]);
      }
    },
    { timeout: 30_000 },
  );

  it(
    "runs demo-counter through the inspection UI",
    async () => {
      const { fetchJson, fetchText } = dashboard();
      const started = await fetchJson<{ runId: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ workflowId: "demo-counter", input: { steps: 3 } }),
      });
      expect(started.status).toBe(200);
      expect(started.body.runId).toBeTruthy();

      let summary: RunApi["summary"] | undefined;
      let events: RunApi["events"] | undefined;
      await waitUntil(
        async () => {
          const { status, body } = await fetchJson<RunApi>(`/api/runs/${started.body.runId}`);
          if (status !== 200) {
            return false;
          }
          summary = body.summary;
          events = body.events;
          return body.summary.status === "completed" || body.summary.status === "failed";
        },
        15_000,
        () => `demo-counter run ${started.body.runId} did not finish\n${dashboard().logs()}`,
      );

      expect(summary?.workflowId).toBe("demo-counter");
      expect(summary?.status).toBe("completed");
      const finished = events?.find((event) => event.type === "run_finished");
      expect(finished?.output).toEqual({ sum: 6, steps: 3 });

      const sse = await fetchText(`/api/runs/${started.body.runId}/events`);
      expect(sse.status).toBe(200);
      expect(sse.body).toContain("data:");
      expect(sse.body).toContain("workflow_finished");
      expect(sse.body).toContain('"sum":6');

      const globalSse = await fetch(`${dashboard().baseUrl}/api/events?afterSeq=0`, {
        signal: AbortSignal.timeout(2_000),
      }).catch(() => null);
      if (globalSse) {
        expect(globalSse.status).toBe(200);
        expect(globalSse.headers.get("content-type") ?? "").toContain("text/event-stream");
        // Read a small prefix then abort — the stream is long-lived.
        const reader = globalSse.body?.getReader();
        if (reader) {
          const { value } = await reader.read();
          const chunk = value ? new TextDecoder().decode(value) : "";
          expect(
            chunk.includes("connected") || chunk.includes("event:") || chunk.includes(":"),
          ).toBe(true);
          await reader.cancel();
        }
      }

      const page = await fetchText(`/workflows/demo-counter/run/${started.body.runId}`);
      expect(page.status).toBe(200);
      expectHealthyHtml(page.body, ["demo-counter"]);
    },
    { timeout: 30_000 },
  );

  it(
    "returns CLI-friendly errors for bad input and unknown workflows",
    async () => {
      const { fetchJson, root } = dashboard();

      const unknown = await fetchJson<{ error?: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ workflowId: "no-such-workflow", input: {} }),
      });
      expect(unknown.status).toBeGreaterThanOrEqual(400);

      const invalid = await fetchJson<{ error?: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ workflowId: "demo-counter", input: { steps: "nope" } }),
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error ?? "").toMatch(/invalid|input/i);

      const badJson = await runAdl(["workflow", "run", "demo-counter", "--input", "{"], {
        cwd: root,
      });
      expect(badJson.exitCode).not.toBe(0);
      expect(`${badJson.stdout}\n${badJson.stderr}`).toMatch(/JSON|input|parse/i);

      const missing = await runAdl(["workflow", "run", "no-such-workflow", "--input", "{}"], {
        cwd: root,
      });
      expect(missing.exitCode).not.toBe(0);
      expect(`${missing.stdout}\n${missing.stderr}`).toMatch(/unknown|not found|no-such-workflow/i);

      const missingAgent = await runAdl(["agent", "run", "no-such-agent", "--input", "hi"], {
        cwd: root,
      });
      expect(missingAgent.exitCode).not.toBe(0);
      expect(`${missingAgent.stdout}\n${missingAgent.stderr}`).toMatch(
        /unknown|not found|no-such-agent/i,
      );
    },
    { timeout: 30_000 },
  );
});
