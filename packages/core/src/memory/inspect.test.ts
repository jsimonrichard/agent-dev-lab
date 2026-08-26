import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import { createAdlRuntime } from "../runtime/create";
import { createTestRuntime } from "../runtime/create-test";
import { CUSTOM_MESSAGE_STORE_KIND, inspectMessageStoreKind } from "./inspect";
import { inMemoryMessageStore } from "./in-memory";
import { sqliteMessageStore } from "./sqlite";
import type { MessageStore } from "./types";

function unlabeledStore(): MessageStore {
  return {
    async load() {
      return [];
    },
    async save() {},
    async delete() {},
    async listScopes() {
      return [];
    },
  };
}

describe("inspectMessageStoreKind", () => {
  it("returns the store kind when set", () => {
    expect(inspectMessageStoreKind(inMemoryMessageStore())).toBe("in-memory");
    expect(inspectMessageStoreKind({ kind: "redis" })).toBe("redis");
  });

  it("returns custom when kind is missing or blank", () => {
    expect(inspectMessageStoreKind(undefined)).toBe(CUSTOM_MESSAGE_STORE_KIND);
    expect(inspectMessageStoreKind({})).toBe(CUSTOM_MESSAGE_STORE_KIND);
    expect(inspectMessageStoreKind({ kind: "   " })).toBe(CUSTOM_MESSAGE_STORE_KIND);
  });
});

describe("Agent.memoryKind", () => {
  it("reports the runtime default store", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({ id: "researcher", instructions: "Be brief." });
    expect(agent.memoryKind).toBe("in-memory");
  });

  it("reports a per-agent store override", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({
      id: "researcher",
      instructions: "Be brief.",
      memory: { store: { ...inMemoryMessageStore(), kind: "redis" } },
    });
    expect(agent.memoryKind).toBe("redis");
  });

  it("reports sqlite when the runtime uses sqliteMessageStore", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-memory-kind-"));
    const adl = createAdlRuntime({
      stores: { message: sqliteMessageStore({ path: path.join(dir, "test.sqlite") }) },
    });
    const agent = adl.createAgent({ id: "researcher", instructions: "Be brief." });
    expect(agent.memoryKind).toBe("sqlite");
  });

  it("reports custom when the store omits kind", () => {
    const adl = createTestRuntime();
    const agent = adl.createAgent({
      id: "researcher",
      instructions: "Be brief.",
      memory: { store: unlabeledStore() },
    });
    expect(agent.memoryKind).toBe(CUSTOM_MESSAGE_STORE_KIND);
  });
});
