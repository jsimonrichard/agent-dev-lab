import { createServer } from "node:net";
import { mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  input: z.object({
    question: z.string().default(${JSON.stringify(`default ${version}`)}),
  }),
  output: z.object({ result: z.string() }),
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
        child.kill("SIGTERM");
        await wait(300);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    { timeout: 70_000 },
  );
});
