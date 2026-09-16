import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import type { BashExecutor, BashExecutorRunOptions, BashExecutorUpdate } from "../bash/executor";
import { OMIT_TMP_DIR_SCHEMA_DESCRIPTION } from "../bash/asrt/tmp-dir.ts";
import { DEFAULT_ALLOWED_DOMAINS } from "../bash/executor-pool.ts";
import { DEFAULT_TIMEOUT_MS } from "../bash/tools";
import { DEFAULT_MAX_BYTES } from "../file/tools";
import {
  objectSchemaFieldDescription,
  omitAllowReadSchemaDescription,
  omitAllowWriteSchemaDescription,
  omitAnchorSchemaDescription,
} from "../fs-bounds.ts";
import { UNBOUNDED_ALLOW_READ } from "../unbounded-allow-read.ts";

import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
} from "../web/tools";

import { createWorkspaceToolProvider, type WorkspaceToolProviderContext } from "./provider";

const toolCallOptions = { toolCallId: "test-tool-call", messages: [] as [] };

function ctx(
  toolProviderContext?: WorkspaceToolProviderContext,
): ExtendedToolProviderContext<WorkspaceToolProviderContext | undefined> {
  return {
    agentId: "test-agent",
    agentCallId: "call-1",
    memoryScope: "test-scope",
    toolProviderContext,
  };
}

function stubExecutor(
  describeOverrides?: Partial<ReturnType<BashExecutor["describe"]>>,
): BashExecutor & {
  calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }>;
} {
  const calls: Array<{ argv: readonly string[]; opts: BashExecutorRunOptions }> = [];
  return {
    calls,
    async *run(argv, opts) {
      calls.push({ argv, opts });
      yield {
        done: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
      } satisfies BashExecutorUpdate;
    },
    describe() {
      return {
        backend: "stub",
        allowWrite: ["/allowed"],
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false },
        ...describeOverrides,
      };
    },
  };
}

/** Drains an async generator, returning every value it yielded, in order. */
async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "adl-workspace-provider-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createWorkspaceToolProvider", () => {
  it("uses one shared cwd for both the file jail root and the bash cwd", async () => {
    const executor = stubExecutor({ allowWrite: [root] });
    const provider = createWorkspaceToolProvider({ executor, cwd: root });
    const { writeFile, bash } = await provider.getTools(ctx());

    await writeFile.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("hi");

    await drain(
      (await bash.execute?.(
        { command: "echo hi" },
        toolCallOptions,
      )) as AsyncIterable<BashExecutorUpdate>,
    );
    expect(executor.calls[0]?.opts.cwd).toBe(root);
  });

  it("overrides the shared cwd via toolProviderContext for both file and bash tools", async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "adl-workspace-provider-other-"));
    try {
      const executor = stubExecutor({ allowWrite: [otherRoot] });
      const provider = createWorkspaceToolProvider({ executor, cwd: root });
      const { writeFile, bash } = await provider.getTools(ctx({ cwd: otherRoot }));

      await writeFile.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions);
      expect(await readFile(path.join(otherRoot, "a.txt"), "utf8")).toBe("hi");

      await drain(
        (await bash.execute?.(
          { command: "echo hi" },
          toolCallOptions,
        )) as AsyncIterable<BashExecutorUpdate>,
      );
      expect(executor.calls[0]?.opts.cwd).toBe(otherRoot);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("denies writeFile when cwd changes but allowWrite stays elsewhere", async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "adl-workspace-provider-other-"));
    try {
      const executor = stubExecutor({ allowWrite: [root] });
      const provider = createWorkspaceToolProvider({ executor, cwd: root });
      const { writeFile } = await provider.getTools(ctx({ cwd: otherRoot }));
      await expect(
        writeFile.execute?.({ path: "a.txt", content: "hi" }, toolCallOptions),
      ).rejects.toThrow(/outside the allowed write roots/);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("throws when no cwd is given anywhere", () => {
    const provider = createWorkspaceToolProvider({ executor: stubExecutor() });
    expect(() => provider.getTools(ctx())).toThrow();
  });

  it("lists fetchUrl unless constructed with fetchUrl: false", () => {
    const withFetch = createWorkspaceToolProvider({ executor: stubExecutor(), cwd: root });
    expect(withFetch.listTools?.().map((summary) => summary.name)).toEqual([
      "readFile",
      "writeFile",
      "editFile",
      "grep",
      "glob",
      "bash",
      "fetchUrl",
      "describeWorkspaceEnv",
    ]);
    expect(
      withFetch.listTools?.().find((summary) => summary.name === "fetchUrl")?.description,
    ).toContain("allowNetwork");
    const withoutFetch = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      fetchUrl: false,
    });
    expect(withoutFetch.listTools?.().map((summary) => summary.name)).not.toContain("fetchUrl");
  });

  it("describeWorkspaceEnv reports fileAccess, bashAccess, and webAccess together", async () => {
    const executor = stubExecutor();
    const provider = createWorkspaceToolProvider({
      executor,
      cwd: root,
      allowNetwork: true,
    });
    const { describeWorkspaceEnv } = await provider.getTools(ctx());
    const result = await describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      fileAccess: {
        root: path.resolve(root),
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [],
        allowWrite: ["/allowed"],
        denyWrite: [],
        maxReadBytes: 1_000_000,
        maxWriteBytes: 1_000_000,
      },
      bashAccess: {
        cwd: root,
        bashTimeoutMs: 30_000,
        backend: "stub",
        allowWrite: ["/allowed"],
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false, allowedDomains: [], deniedDomains: [] },
      },
      webAccess: {
        allowedSchemes: ["http", "https"],
        allowedUrls: [],
        allowedDomains: DEFAULT_ALLOWED_DOMAINS,
        allowPrivateNetwork: false,
        fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
        maxRedirects: DEFAULT_MAX_REDIRECTS,
      },
    });
  });

  it("describeWorkspaceEnv reports bash allowRead on fileAccess without inserting cwd", async () => {
    const executor = stubExecutor({ allowRead: ["/only-this"] });
    const provider = createWorkspaceToolProvider({ executor, cwd: root });
    const { describeWorkspaceEnv } = await provider.getTools(ctx());
    const result = await describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toMatchObject({
      fileAccess: {
        allowRead: ["/only-this"],
        denyRead: [],
        allowWrite: ["/allowed"],
        denyWrite: [],
      },
      bashAccess: { allowRead: ["/only-this"] },
    });
  });

  it("does not let readFile use the write root when allowRead is a different list", async () => {
    await Bun.write(path.join(root, "inside.txt"), "inside");
    const executor = stubExecutor({ allowRead: ["/only-this"], allowWrite: [root] });
    const provider = createWorkspaceToolProvider({ executor, cwd: root });
    const { readFile: readFileTool } = await provider.getTools(ctx());
    await expect(readFileTool.execute?.({ path: "inside.txt" }, toolCallOptions)).rejects.toThrow(
      /outside the allowed read roots/,
    );
  });

  it("keeps bashTimeoutMs and fetchTimeoutMs as independent knobs", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      bashTimeoutMs: 111,
      fetchTimeoutMs: 222,
      allowNetwork: true,
    });
    const { describeWorkspaceEnv } = await provider.getTools(ctx());
    const constructed = await describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(constructed).toMatchObject({
      bashAccess: { bashTimeoutMs: 111 },
      webAccess: { fetchTimeoutMs: 222 },
    });

    const { describeWorkspaceEnv: fromContext } = await provider.getTools(
      ctx({ bashTimeoutMs: 333, fetchTimeoutMs: 444 }),
    );
    const overridden = await fromContext.execute?.({}, toolCallOptions);
    expect(overridden).toMatchObject({
      bashAccess: { bashTimeoutMs: 333 },
      webAccess: { fetchTimeoutMs: 444 },
    });
  });

  it("overrides fetchUrl options via toolProviderContext without touching bashTimeoutMs", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      allowedUrls: ["https://docs.internal:443/**"],
      bashTimeoutMs: 111,
      allowNetwork: true,
    });
    const { describeWorkspaceEnv } = await provider.getTools(
      ctx({
        allowedUrls: ["https://other.internal:8080/**"],
        allowPrivateNetwork: true,
        maxResponseBytes: 888,
        maxRedirects: 7,
      }),
    );
    const result = await describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toMatchObject({
      bashAccess: { bashTimeoutMs: 111 },
      webAccess: {
        allowedUrls: ["https://other.internal:8080/**"],
        allowPrivateNetwork: true,
        maxResponseBytes: 888,
        maxRedirects: 7,
      },
    });
  });

  it("omits fetchUrl and webAccess when constructed with fetchUrl: false", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      fetchUrl: false,
    });
    expect(provider.listTools?.().map((summary) => summary.name)).toEqual([
      "readFile",
      "writeFile",
      "editFile",
      "grep",
      "glob",
      "bash",
      "describeWorkspaceEnv",
    ]);
    expect(
      provider.listTools?.().find((summary) => summary.name === "describeWorkspaceEnv")
        ?.description,
    ).not.toContain("fetchUrl");
    const tools = await provider.getTools(ctx());
    expect(tools.fetchUrl).toBeUndefined();
    expect(tools.describeWorkspaceEnv.description).not.toContain("fetchUrl");
    const result = await tools.describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toEqual({
      fileAccess: {
        root: path.resolve(root),
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [],
        allowWrite: ["/allowed"],
        denyWrite: [],
        maxReadBytes: 1_000_000,
        maxWriteBytes: 1_000_000,
      },
      bashAccess: {
        cwd: root,
        bashTimeoutMs: 30_000,
        backend: "stub",
        allowWrite: ["/allowed"],
        allowRead: UNBOUNDED_ALLOW_READ,
        denyRead: [],
        denyWrite: [],
        network: { allowNetwork: false, allowedDomains: [], deniedDomains: [] },
      },
    });
    expect(result).not.toHaveProperty("webAccess");
  });

  it("omits fetchUrl and webAccess when allowNetwork is false", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
    });
    expect(provider.listTools?.().map((summary) => summary.name)).toContain("fetchUrl");
    expect(
      provider.listTools?.().find((summary) => summary.name === "describeWorkspaceEnv")
        ?.description,
    ).toContain("fetchUrl");
    const tools = await provider.getTools(ctx());
    expect(tools.fetchUrl).toBeUndefined();
    expect(tools.describeWorkspaceEnv.description).toContain("fetchUrl");
    const result = await tools.describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).not.toHaveProperty("webAccess");
  });

  it("includes fetchUrl for a call when toolProviderContext.allowNetwork is true", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
    });
    const tools = await provider.getTools(ctx({ allowNetwork: true }));
    expect(tools.fetchUrl).toBeDefined();
    const result = await tools.describeWorkspaceEnv.execute?.({}, toolCallOptions);
    expect(result).toHaveProperty("webAccess");
  });

  it("does not treat empty allowedUrls as a deny that removes fetchUrl", () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      allowedUrls: [],
      allowNetwork: true,
    });
    expect(provider.listTools?.().map((summary) => summary.name)).toContain("fetchUrl");
  });

  it("throws when fetch options are set and fetchUrl is disabled", () => {
    expect(() =>
      createWorkspaceToolProvider({
        executor: stubExecutor(),
        cwd: root,
        fetchUrl: false,
        allowedUrls: ["https://docs.example.com/**"],
      }),
    ).toThrow(/fetchUrl is disabled but allowedUrls was set on options/);
  });

  it("throws when fetch toolProviderContext is set and fetchUrl is disabled", () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      fetchUrl: false,
    });
    expect(() => provider.getTools(ctx({ fetchTimeoutMs: 1_000 }))).toThrow(
      /fetchUrl is disabled but fetchTimeoutMs was set on toolProviderContext/,
    );
  });

  it("carries allowedUrls from workspace context into the fetchUrl tool", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      allowNetwork: true,
    });
    const tools = await provider.getTools(ctx({ allowedUrls: ["http://127.0.0.1:9/**"] }));
    expect(tools.fetchUrl).toBeDefined();
    const fetchUrl = tools.fetchUrl!;

    let message = "";
    try {
      await fetchUrl.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/not a public address/);

    await expect(
      fetchUrl.execute?.({ url: "http://127.0.0.1:10/x" }, toolCallOptions),
    ).rejects.toThrow(/not a public address/);
  });

  it("carries allowedDomains from workspace context into the fetchUrl tool", async () => {
    const provider = createWorkspaceToolProvider({
      executor: stubExecutor(),
      cwd: root,
      allowNetwork: true,
    });
    const tools = await provider.getTools(ctx({ allowedDomains: ["example.com"] }));
    expect(tools.fetchUrl).toBeDefined();
    await expect(
      tools.fetchUrl!.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions),
    ).rejects.toThrow(/allowedDomains/);

    const allowed = await provider.getTools(
      ctx({
        allowedDomains: ["127.0.0.1"],
        allowedUrls: ["http://127.0.0.1:9/**"],
      }),
    );
    let message = "";
    try {
      await allowed.fetchUrl!.execute?.({ url: "http://127.0.0.1:9/x" }, toolCallOptions);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/allowedDomains/);
    expect(message).not.toMatch(/not a public address/);
  });

  it("declares a contextSchema that accepts glob strings and RegExp allowedUrls entries", () => {
    const provider = createWorkspaceToolProvider({ executor: stubExecutor(), cwd: root });
    const pattern = /^https:\/\/docs\.internal:443\/wiki\/[\w-]+$/;
    const parsed = provider.contextSchema?.parse({
      allowedUrls: ["https://docs.internal:443/**", pattern],
      fetchTimeoutMs: 1_000,
      bashTimeoutMs: 2_000,
    });
    expect(parsed).toEqual({
      allowedUrls: ["https://docs.internal:443/**", pattern],
      fetchTimeoutMs: 1_000,
      bashTimeoutMs: 2_000,
      allowPrivateNetwork: false,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
      maxRedirects: DEFAULT_MAX_REDIRECTS,
      maxReadBytes: DEFAULT_MAX_BYTES,
      maxWriteBytes: DEFAULT_MAX_BYTES,
      allowedDomains: DEFAULT_ALLOWED_DOMAINS,
      deniedDomains: [],
      allowNetwork: false,
      allowEnv: [],
    });
  });

  it("fills hardcoded runtime defaults when parsing empty context", () => {
    const provider = createWorkspaceToolProvider({ executor: stubExecutor(), cwd: root });
    expect(provider.contextSchema?.parse({})).toEqual({
      bashTimeoutMs: DEFAULT_TIMEOUT_MS,
      maxReadBytes: DEFAULT_MAX_BYTES,
      maxWriteBytes: DEFAULT_MAX_BYTES,
      allowedDomains: DEFAULT_ALLOWED_DOMAINS,
      deniedDomains: [],
      allowNetwork: false,
      allowEnv: [],
      fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      allowedUrls: [],
      allowPrivateNetwork: false,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
      maxRedirects: DEFAULT_MAX_REDIRECTS,
    });
  });

  it("describes omit-defaults that depend on cwd", () => {
    const provider = createWorkspaceToolProvider({ executor: stubExecutor(), cwd: root });
    expect(objectSchemaFieldDescription(provider.contextSchema, "cwd")).toBe(
      omitAnchorSchemaDescription("cwd"),
    );
    expect(objectSchemaFieldDescription(provider.contextSchema, "allowWrite")).toBe(
      omitAllowWriteSchemaDescription("cwd"),
    );
    expect(objectSchemaFieldDescription(provider.contextSchema, "allowRead")).toBe(
      omitAllowReadSchemaDescription("cwd"),
    );
    expect(objectSchemaFieldDescription(provider.contextSchema, "tmpDir")).toBe(
      OMIT_TMP_DIR_SCHEMA_DESCRIPTION,
    );
  });
});
