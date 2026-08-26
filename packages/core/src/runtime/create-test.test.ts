import { describe, expect, it } from "bun:test";

import { AdlError } from "../errors";
import { createTestRuntime } from "./create-test";

describe("createTestRuntime", () => {
  it("uses in-memory stores by default", async () => {
    const adl = createTestRuntime();
    await adl.services.stores.message.save("t", [{ role: "user", content: "hi" }]);
    expect(await adl.services.stores.message.load("t")).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws AdlError when an agent has no model", async () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({
      id: "no-model",
      systemPrompt: "test",
    });
    await expect(agent.run({ memoryScope: "s", user: "hi" }).result).rejects.toBeInstanceOf(
      AdlError,
    );
  });
});
