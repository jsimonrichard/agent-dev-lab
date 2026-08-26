import { describe, expect, it } from "bun:test";

import type { Template } from "../template/types";
import { resolveInstructionsText } from "./resolve-instructions";

function stubTemplate<TInput>(
  template: Pick<Template<TInput>, "render" | "demo">,
): Template<TInput> {
  return { name: "stub", source: "", ...template };
}

describe("resolveInstructionsText", () => {
  it("returns string instructions as-is", () => {
    expect(resolveInstructionsText("You are helpful.")).toBe("You are helpful.");
  });

  it("renders a template with demo data when present", () => {
    expect(
      resolveInstructionsText(
        stubTemplate({
          demo: { role: "editor" },
          render: (data) => `You are an ${data.role}.`,
        }),
      ),
    ).toBe("You are an editor.");
  });

  it("renders a template with an empty object when demo is absent", () => {
    expect(resolveInstructionsText(stubTemplate({ render: () => "You are helpful." }))).toBe(
      "You are helpful.",
    );
  });
});
