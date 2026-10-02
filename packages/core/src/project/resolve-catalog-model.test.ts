import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "bun:test";

import { AdlError } from "../errors";
import { loadAdlProject } from "./resolve";
import { assertCatalogModelApiKey, resolveCatalogModel } from "./resolve-catalog-model";

const coreEntryUrl = pathToFileURL(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../index.ts"),
).href;

async function writeCatalogProject(modelsSource: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "adl-resolve-model-"));
  await writeFile(
    path.join(dir, "adl.config.ts"),
    `
import { createAdlRuntime } from ${JSON.stringify(coreEntryUrl)};

const adl = createAdlRuntime({ loadEnv: false });
const fakeModel = { modelId: "catalog-model", provider: "test.provider" };
export default {
  name: "resolve-model",
  adl,
  models: ${modelsSource},
};
`,
  );
  return dir;
}

describe("resolveCatalogModel", () => {
  it("returns the factory LanguageModel for a known id", async () => {
    const dir = await writeCatalogProject(`[
      { id: "mini", label: "Mini", provider: "test", factory: () => fakeModel },
    ]`);
    const project = await loadAdlProject({ root: dir });
    const model = resolveCatalogModel(project, "mini");
    expect(model as unknown).toEqual({ modelId: "catalog-model", provider: "test.provider" });
  });

  it("throws UNKNOWN_MODEL for an unknown id (no silent default)", async () => {
    const dir = await writeCatalogProject(`[
      { id: "mini", label: "Mini", provider: "test", factory: () => fakeModel },
    ]`);
    const project = await loadAdlProject({ root: dir });
    try {
      resolveCatalogModel(project, "missing");
      throw new Error("expected UNKNOWN_MODEL");
    } catch (error) {
      expect(error).toBeInstanceOf(AdlError);
      expect((error as AdlError).code).toBe("UNKNOWN_MODEL");
    }
  });

  it("throws when factory returns null", async () => {
    const dir = await writeCatalogProject(`[
      { id: "bad", label: "Bad", provider: "test", factory: () => null },
    ]`);
    const project = await loadAdlProject({ root: dir });
    try {
      resolveCatalogModel(project, "bad");
      throw new Error("expected INVALID_CONFIG");
    } catch (error) {
      expect(error).toBeInstanceOf(AdlError);
      expect((error as AdlError).code).toBe("INVALID_CONFIG");
    }
  });
});

describe("assertCatalogModelApiKey", () => {
  it("no-ops when apiKeyEnv is omitted", () => {
    assertCatalogModelApiKey({
      id: "x",
      label: "X",
      provider: "test",
      factory: () => ({ modelId: "x" }) as never,
    });
  });

  it("throws MISSING_API_KEY when the env var is unset", () => {
    try {
      assertCatalogModelApiKey(
        {
          id: "x",
          label: "X",
          provider: "test",
          apiKeyEnv: "ADL_TEST_MISSING_KEY_XYZ",
          factory: () => ({ modelId: "x" }) as never,
        },
        {},
      );
      throw new Error("expected MISSING_API_KEY");
    } catch (error) {
      expect(error).toBeInstanceOf(AdlError);
      expect((error as AdlError).code).toBe("MISSING_API_KEY");
    }
  });

  it("passes when the env var is set", () => {
    assertCatalogModelApiKey(
      {
        id: "x",
        label: "X",
        provider: "test",
        apiKeyEnv: "ADL_TEST_PRESENT_KEY",
        factory: () => ({ modelId: "x" }) as never,
      },
      { ADL_TEST_PRESENT_KEY: "sk-test" },
    );
  });
});
