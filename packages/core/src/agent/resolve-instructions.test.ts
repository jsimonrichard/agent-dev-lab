import { describe, expect, it } from "bun:test";

import { resolveInstructionsText } from "./resolve-instructions";

describe("resolveInstructionsText", () => {
  it("returns string instructions as-is", () => {
    expect(resolveInstructionsText("You are helpful.")).toBe("You are helpful.");
  });

  it("renders a template with demo data when present", () => {
    expect(
      resolveInstructionsText({
        demo: { role: "editor" },
        render: (data) => `You are an ${(data as { role: string }).role}.`,
      }),
    ).toBe("You are an editor.");
  });

  it("renders a template with an empty object when demo is absent", () => {
    expect(
      resolveInstructionsText({
        render: () => "You are helpful.",
      }),
    ).toBe("You are helpful.");
  });
});
