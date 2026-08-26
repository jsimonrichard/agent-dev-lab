import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { ADL_PROJECT_WATCH_ENV } from "../project/config";
import { createAdlRuntime } from "../runtime/create";
import { createTemplate } from "./create";

describe("createTemplate", () => {
  const runtime = createAdlRuntime();

  it("renders a fixture prompt from path", () => {
    const tpl = createTemplate(runtime, {
      path: "../prompt/fixtures/sample-agent.md",
      from: import.meta.url,
      inputData: z.object({ project: z.string() }),
    });

    expect(tpl.name).toBe("sample-agent");
    expect(tpl.path).toBe("../prompt/fixtures/sample-agent.md");
    expect(tpl.source).toContain("research workflows");
    expect(tpl.render({ project: "Ada" })).toContain("Ada");
  });

  it("renders inline source with explicit name", () => {
    const tpl = createTemplate(runtime, {
      name: "greeting",
      source: "Hello {{name}}!",
      inputData: z.object({ name: z.string() }),
    });

    expect(tpl.name).toBe("greeting");
    expect(tpl.path).toBeUndefined();
    expect(tpl.render({ name: "Ada" })).toBe("Hello Ada!");
  });

  it("re-reads a file-backed template from disk on each render when project watch is enabled", async () => {
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");

    const previous = process.env[ADL_PROJECT_WATCH_ENV];
    process.env[ADL_PROJECT_WATCH_ENV] = "1";

    try {
      const dir = await mkdtemp(path.join(tmpdir(), "adl-template-"));
      const promptPath = path.join(dir, "prompt.md");
      await writeFile(promptPath, "Hello {{name}}", "utf8");

      const tpl = createTemplate(runtime, {
        path: "./prompt.md",
        from: pathToFileURL(path.join(dir, "index.ts")).href,
        inputData: z.object({ name: z.string() }),
      });

      expect(tpl.render({ name: "Ada" })).toBe("Hello Ada");

      await writeFile(promptPath, "Hi {{name}}", "utf8");
      expect(tpl.render({ name: "Ada" })).toBe("Hi Ada");
    } finally {
      if (previous === undefined) {
        delete process.env[ADL_PROJECT_WATCH_ENV];
      } else {
        process.env[ADL_PROJECT_WATCH_ENV] = previous;
      }
    }
  });

  it("caches file-backed template text when project watch is disabled", async () => {
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");

    const previous = process.env[ADL_PROJECT_WATCH_ENV];
    delete process.env[ADL_PROJECT_WATCH_ENV];

    try {
      const dir = await mkdtemp(path.join(tmpdir(), "adl-template-"));
      const promptPath = path.join(dir, "prompt.md");
      await writeFile(promptPath, "Hello {{name}}", "utf8");

      const tpl = createTemplate(runtime, {
        path: "./prompt.md",
        from: pathToFileURL(path.join(dir, "index.ts")).href,
        inputData: z.object({ name: z.string() }),
      });

      expect(tpl.render({ name: "Ada" })).toBe("Hello Ada");

      await writeFile(promptPath, "Hi {{name}}", "utf8");
      expect(tpl.render({ name: "Ada" })).toBe("Hello Ada");
    } finally {
      if (previous === undefined) {
        delete process.env[ADL_PROJECT_WATCH_ENV];
      } else {
        process.env[ADL_PROJECT_WATCH_ENV] = previous;
      }
    }
  });

  it("reuses compiled templates from the runtime engine cache", () => {
    const source = "Cached {{value}}";
    const tplA = runtime.createTemplate({
      name: "cached-a",
      source,
      inputData: z.object({ value: z.string() }),
    });
    const tplB = runtime.createTemplate({
      name: "cached-b",
      source,
      inputData: z.object({ value: z.string() }),
    });

    expect(tplA.render({ value: "one" })).toBe("Cached one");
    expect(tplB.render({ value: "two" })).toBe("Cached two");
  });
});
