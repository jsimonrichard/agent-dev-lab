import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sqliteInspectorAgentSettingsStore } from "./inspector-agent-settings";

async function uniqueDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "adl-inspector-settings-"));
  return path.join(dir, "agent-dev-lab.sqlite");
}

describe("sqliteInspectorAgentSettingsStore", () => {
  it("returns undefined when no default is saved", async () => {
    const store = sqliteInspectorAgentSettingsStore({ path: await uniqueDbPath() });
    expect(store.get("coder")).toBeUndefined();
  });

  it("persists and reloads a default toolProviderContext", async () => {
    const dbPath = await uniqueDbPath();
    const store = sqliteInspectorAgentSettingsStore({ path: dbPath });
    store.set("coder", { projectPath: "/tmp/crate" });

    const reopened = sqliteInspectorAgentSettingsStore({ path: dbPath });
    expect(reopened.get("coder")).toEqual({
      agentId: "coder",
      defaultToolProviderContext: { projectPath: "/tmp/crate" },
      updatedAt: expect.any(String),
    });
  });

  it("clears the default when set to undefined", async () => {
    const store = sqliteInspectorAgentSettingsStore({ path: await uniqueDbPath() });
    store.set("coder", { projectPath: "/tmp/crate" });
    store.set("coder", undefined);
    expect(store.get("coder")).toEqual({
      agentId: "coder",
      updatedAt: expect.any(String),
    });
    expect(store.get("coder")?.defaultToolProviderContext).toBeUndefined();
  });
});
