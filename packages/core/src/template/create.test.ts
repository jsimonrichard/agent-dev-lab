import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { createTemplate } from "./create";

describe("createTemplate", () => {
  it("renders a fixture prompt with Zod-validated input", () => {
    const tpl = createTemplate({
      path: "../prompt/fixtures/sample-agent.md",
      from: import.meta.url,
      inputData: z.object({ project: z.string() }),
    });

    expect(tpl.name).toBe("sample-agent");
    expect(tpl.render({ project: "Ada" })).toContain("Ada");
  });
});
