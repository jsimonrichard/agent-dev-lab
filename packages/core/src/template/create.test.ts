import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { createTemplate } from "./create";

describe("createTemplate", () => {
  it("renders a fixture prompt from path", () => {
    const tpl = createTemplate({
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
    const tpl = createTemplate({
      name: "greeting",
      source: "Hello {{name}}!",
      inputData: z.object({ name: z.string() }),
    });

    expect(tpl.name).toBe("greeting");
    expect(tpl.path).toBeUndefined();
    expect(tpl.render({ name: "Ada" })).toBe("Hello Ada!");
  });
});
