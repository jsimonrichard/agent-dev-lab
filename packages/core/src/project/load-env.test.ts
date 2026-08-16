import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { loadAdlProject } from "./resolve";
import { loadAdlProjectEnv } from "./load-env";

const TRACKED_KEYS = [
  "ADL_ENV_FROM_DOTENV",
  "ADL_ENV_FROM_LOCAL",
  "ADL_ENV_FROM_MODE",
  "ADL_ENV_SHARED",
  "ADL_ENV_EXISTING",
  "ADL_ENV_EXPANDED",
  "ADL_ENV_EXPAND_SRC",
  "ADL_ENV_PROJECT_NAME",
] as const;

const saved = new Map<string, string | undefined>();

function snapshotEnv(): void {
  saved.clear();
  for (const key of TRACKED_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  saved.clear();
}

async function tempProject(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "adl-env-"));
}

describe("loadAdlProjectEnv", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("loads .env from the project root", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_FROM_DOTENV=hello\n");

    const { loadedFiles } = loadAdlProjectEnv(dir, { mode: "development" });

    expect(loadedFiles).toEqual([".env"]);
    expect(process.env.ADL_ENV_FROM_DOTENV).toBe("hello");
  });

  it("does not override existing process.env values", async () => {
    snapshotEnv();
    process.env.ADL_ENV_EXISTING = "from-process";
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_EXISTING=from-file\n");

    loadAdlProjectEnv(dir, { mode: "development" });

    expect(process.env.ADL_ENV_EXISTING).toBe("from-process");
  });

  it("lets .env.local override .env in development", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_SHARED=base\nADL_ENV_FROM_DOTENV=base-only\n");
    await writeFile(path.join(dir, ".env.local"), "ADL_ENV_SHARED=local\n");

    const { loadedFiles } = loadAdlProjectEnv(dir, { mode: "development" });

    expect(loadedFiles).toEqual([".env.local", ".env"]);
    expect(process.env.ADL_ENV_SHARED).toBe("local");
    expect(process.env.ADL_ENV_FROM_DOTENV).toBe("base-only");
  });

  it("lets .env.development override .env", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_FROM_MODE=base\n");
    await writeFile(path.join(dir, ".env.development"), "ADL_ENV_FROM_MODE=dev\n");

    loadAdlProjectEnv(dir, { mode: "development" });

    expect(process.env.ADL_ENV_FROM_MODE).toBe("dev");
  });

  it("skips .env.local in test mode", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_SHARED=base\n");
    await writeFile(path.join(dir, ".env.local"), "ADL_ENV_SHARED=local\n");
    await writeFile(path.join(dir, ".env.test"), "ADL_ENV_FROM_MODE=test\n");

    const { loadedFiles } = loadAdlProjectEnv(dir, { mode: "test" });

    expect(loadedFiles).toEqual([".env.test", ".env"]);
    expect(process.env.ADL_ENV_SHARED).toBe("base");
    expect(process.env.ADL_ENV_FROM_MODE).toBe("test");
  });

  it("expands $VAR references against process.env", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(
      path.join(dir, ".env"),
      "ADL_ENV_EXPAND_SRC=root\nADL_ENV_EXPANDED=$ADL_ENV_EXPAND_SRC/child\n",
    );

    loadAdlProjectEnv(dir, { mode: "development" });

    expect(process.env.ADL_ENV_EXPANDED).toBe("root/child");
  });
});

describe("loadAdlProject env loading", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("applies project .env before evaluating adl.config.ts", async () => {
    snapshotEnv();
    const dir = await tempProject();
    await writeFile(path.join(dir, ".env"), "ADL_ENV_PROJECT_NAME=from-dotenv\n");
    await writeFile(
      path.join(dir, "adl.config.ts"),
      `export default { name: process.env.ADL_ENV_PROJECT_NAME ?? "missing" };\n`,
    );

    const project = await loadAdlProject({ root: dir });

    expect(project.config.name).toBe("from-dotenv");
  });
});
