import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "bun:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const corePkg = path.join(repoRoot, "packages/core");
const webPkg = path.join(repoRoot, "apps/web");
const zodPkg = path.dirname(createRequire(import.meta.url).resolve("zod/package.json"));

type PlaygroundLikeProject = {
  root: string;
  workflowPath: string;
  writeWorkflow: (version: string, options?: { atomic?: boolean }) => Promise<void>;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await wait(40);
  }
  throw new Error(message);
}

function workflowSource(version: string): string {
  return `import { z } from "zod";
import { adl } from "#adl";

export const answerQuestion = adl.createWorkflow({
  id: "answer-question",
  inputSchema: z.object({
    question: z.string().default(${JSON.stringify(`default ${version}`)}),
  }),
  outputSchema: z.object({ result: z.string() }),
  run: async (input) => ({ result: input.question + ${JSON.stringify(`_${version}`)} }),
});
`;
}

async function createPlaygroundLikeProject(): Promise<PlaygroundLikeProject> {
  const root = await mkdtemp(path.join(tmpdir(), "adl-watch-e2e-"));
  const srcDir = path.join(root, "src");
  const workflowsDir = path.join(srcDir, "workflows");
  await mkdir(workflowsDir, { recursive: true });

  mkdirSync(path.join(root, "node_modules/@agent-dev-lab"), { recursive: true });
  symlinkSync(corePkg, path.join(root, "node_modules/@agent-dev-lab/core"));
  symlinkSync(zodPkg, path.join(root, "node_modules/zod"));

  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "adl-watch-e2e",
      type: "module",
      imports: { "#adl": "./src/adl.ts" },
    }),
    "utf8",
  );

  writeFileSync(
    path.join(srcDir, "adl.ts"),
    `import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});
`,
    "utf8",
  );

  const workflowPath = path.join(workflowsDir, "answer-question.ts");

  const writeWorkflow = async (version: string, options?: { atomic?: boolean }) => {
    const contents = workflowSource(version);
    if (!options?.atomic) {
      await writeFile(workflowPath, contents, "utf8");
      return;
    }
    const tmpPath = `${workflowPath}.${process.pid}.tmp`;
    await writeFile(tmpPath, contents, "utf8");
    await rename(tmpPath, workflowPath);
  };

  await writeWorkflow("A");
  await writeFile(
    path.join(root, "adl.config.ts"),
    `import { adl } from "#adl";
import { answerQuestion } from "./src/workflows/answer-question";

export default {
  name: "watch-e2e",
  adl,
  workflows: [answerQuestion],
};
`,
    "utf8",
  );

  return { root, workflowPath, writeWorkflow };
}

type ProjectApiResponse = {
  meta: {
    generation: number;
    lastReloadError: string | null;
    workflows: { id: string; inputSample?: { question?: string } }[];
  };
};

async function fetchProjectApi(port: number): Promise<ProjectApiResponse> {
  const response = await fetch(`http://127.0.0.1:${port}/api/project`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`GET /api/project failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as ProjectApiResponse;
}

async function waitForProjectApi(
  port: number,
  predicate: (body: ProjectApiResponse) => boolean,
  timeoutMs: number,
  message: () => string,
): Promise<ProjectApiResponse> {
  let lastBody: ProjectApiResponse | undefined;
  let lastError: unknown;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      lastBody = await fetchProjectApi(port);
      if (predicate(lastBody)) {
        return lastBody;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(40);
  }
  const detail = lastBody
    ? `last meta: ${JSON.stringify(lastBody.meta)}`
    : lastError instanceof Error
      ? lastError.message
      : "";
  throw new Error(`${message()}${detail ? `\n${detail}` : ""}`);
}

function workflowSampleQuestion(body: ProjectApiResponse): string | undefined {
  return body.meta.workflows.find((workflow) => workflow.id === "answer-question")?.inputSample
    ?.question;
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function startDashboard(projectRoot: string, port: number, logPath: string): ChildProcess {
  const logFd = openSync(logPath, "w");
  return spawn(
    process.execPath,
    ["--bun", "vite", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: webPkg,
      env: {
        ...process.env,
        ADL_PROJECT_ROOT: projectRoot,
        ADL_FRAMEWORK_DEV: "0",
        // This test only hits /api/project. CI spent 40s in the client
        // optimizer ("bundling dependencies...") and never delivered watch
        // events; skip that work.
        ADL_VITE_DISABLE_OPTIMIZE: "1",
        PORT: String(port),
        BROWSER: "none",
        NO_COLOR: "1",
      },
      stdio: ["ignore", logFd, logFd],
    },
  );
}

const nitroServerEntry = path.join(webPkg, ".output/server/index.mjs");

function startServeDashboard(
  projectRoot: string,
  port: number,
  logPath: string,
  options?: { watch?: boolean },
): ChildProcess {
  if (!existsSync(nitroServerEntry)) {
    throw new Error(
      `Nitro UI build is missing (${nitroServerEntry}). Build @agent-dev-lab/web before this test.`,
    );
  }
  const logFd = openSync(logPath, "w");
  // Packed installs run Node `.output`, not Bun (`better-sqlite3`). `--serve`
  // is the watch opt-out (`ADL_PROJECT_WATCH=0`); Nitro alone still watches.
  return spawn("node", [nitroServerEntry], {
    cwd: webPkg,
    env: {
      ...process.env,
      ADL_PROJECT_ROOT: projectRoot,
      ADL_FRAMEWORK_DEV: "0",
      ADL_INSPECTOR_SERVE: "1",
      ADL_PROJECT_WATCH: options?.watch === false ? "0" : "1",
      PORT: String(port),
      BROWSER: "none",
      NO_COLOR: "1",
    },
    stdio: ["ignore", logFd, logFd],
  });
}

type RunApiResponse = {
  summary: { status: string };
  events: { type: string; output?: { result?: string } }[];
};

async function runAnswerQuestion(port: number, question: string): Promise<string> {
  const started = await fetch(`http://127.0.0.1:${port}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: "answer-question", input: { question } }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!started.ok) {
    throw new Error(`POST /api/runs failed: ${started.status} ${await started.text()}`);
  }
  const { runId } = (await started.json()) as { runId: string };
  let lastBody: RunApiResponse | undefined;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/api/runs/${encodeURIComponent(runId)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      lastBody = (await response.json()) as RunApiResponse;
      const finished = lastBody.events.find((event) => event.type === "run_finished");
      if (finished?.output?.result !== undefined) {
        return finished.output.result;
      }
    }
    await wait(40);
  }
  throw new Error(
    `run ${runId} never finished with an output\n${lastBody ? JSON.stringify(lastBody) : ""}`,
  );
}

async function stopDashboard(child: ChildProcess, root: string): Promise<void> {
  child.kill("SIGTERM");
  await wait(300);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  rmSync(root, { recursive: true, force: true });
}

function dashboardLogs(logPath: string): string {
  try {
    return readFileSync(logPath, "utf8");
  } catch {
    return "";
  }
}

describe("inspection UI server hot reload e2e (no browser)", () => {
  it(
    "GET /api/project picks up an atomic edit to src/workflows/answer-question.ts",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      const port = await allocatePort();
      const logPath = path.join(fixture.root, "vite.log");
      const child = startDashboard(fixture.root, port, logPath);
      const logs = () => dashboardLogs(logPath);

      try {
        await waitUntil(
          () => logs().includes("Local:"),
          30_000,
          `dashboard never printed a ready URL on port ${port}\n${logs()}`,
        );

        await waitForProjectApi(
          port,
          (body) =>
            workflowSampleQuestion(body) === "default A" && body.meta.lastReloadError === null,
          20_000,
          () => `GET /api/project never returned the initial nested workflow sample\n${logs()}`,
        );

        await wait(40);
        await fixture.writeWorkflow("E", { atomic: true });

        await waitForProjectApi(
          port,
          (body) =>
            body.meta.generation >= 1 &&
            workflowSampleQuestion(body) === "default E" &&
            body.meta.lastReloadError === null,
          20_000,
          () => `dashboard did not pick up nested workflow edit\n${logs()}`,
        );
      } finally {
        await stopDashboard(child, fixture.root);
      }
    },
    { timeout: 70_000 },
  );
});

describe("inspection UI packed Nitro hot reload e2e (Node .output)", () => {
  it(
    "GET /api/project reloads on an atomic edit when Nitro is not --serve",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      const port = await allocatePort();
      const logPath = path.join(fixture.root, "serve.log");
      const child = startServeDashboard(fixture.root, port, logPath);
      const logs = () => dashboardLogs(logPath);

      try {
        await waitForProjectApi(
          port,
          (body) =>
            workflowSampleQuestion(body) === "default A" && body.meta.lastReloadError === null,
          30_000,
          () => `GET /api/project never returned the initial nested workflow sample\n${logs()}`,
        );

        await wait(40);
        await fixture.writeWorkflow("E", { atomic: true });

        await waitForProjectApi(
          port,
          (body) =>
            body.meta.generation >= 1 &&
            workflowSampleQuestion(body) === "default E" &&
            body.meta.lastReloadError === null,
          20_000,
          () => `packed Nitro dashboard did not pick up nested workflow edit\n${logs()}`,
        );

        const result = await runAnswerQuestion(port, "probe");
        if (result !== "probe_E") {
          throw new Error(`reloaded workflow did not run: expected probe_E, got ${result}`);
        }

        await writeFile(fixture.workflowPath, "this is not valid typescript [[[\n", "utf8");

        const failed = await waitForProjectApi(
          port,
          (body) =>
            body.meta.lastReloadError !== null && workflowSampleQuestion(body) === "default E",
          20_000,
          () =>
            `packed Nitro dashboard did not surface lastReloadError after a broken edit\n${logs()}`,
        );
        if (failed.meta.generation < 1) {
          throw new Error(
            `broken edit must keep the previous registry (generation was ${failed.meta.generation})`,
          );
        }
      } finally {
        await stopDashboard(child, fixture.root);
      }
    },
    { timeout: 70_000 },
  );
});

describe("inspection UI --serve disables project watch", () => {
  it(
    "GET /api/project stays at generation 0 after an atomic edit when ADL_PROJECT_WATCH=0",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      const port = await allocatePort();
      const logPath = path.join(fixture.root, "serve-nowatch.log");
      const child = startServeDashboard(fixture.root, port, logPath, { watch: false });
      const logs = () => dashboardLogs(logPath);

      try {
        await waitForProjectApi(
          port,
          (body) =>
            workflowSampleQuestion(body) === "default A" && body.meta.lastReloadError === null,
          30_000,
          () => `GET /api/project never returned the initial nested workflow sample\n${logs()}`,
        );

        await wait(40);
        await fixture.writeWorkflow("E", { atomic: true });
        await wait(2_000);

        const body = await fetchProjectApi(port);
        if (body.meta.generation !== 0 || workflowSampleQuestion(body) !== "default A") {
          throw new Error(
            `--serve must leave the registry unchanged\n${JSON.stringify(body.meta)}\n${logs()}`,
          );
        }
      } finally {
        await stopDashboard(child, fixture.root);
      }
    },
    { timeout: 70_000 },
  );
});
