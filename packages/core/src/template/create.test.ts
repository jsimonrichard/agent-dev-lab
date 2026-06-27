import { describe, expect, it } from "bun:test";
import { z } from "zod";

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
