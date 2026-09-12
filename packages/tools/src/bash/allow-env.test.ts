import { describe, expect, it } from "bun:test";

import { canonicalizeAllowEnv, resolveAllowEnv } from "./allow-env";

describe("resolveAllowEnv", () => {
  it("returns an empty object when omitted or empty", () => {
    expect(resolveAllowEnv(undefined)).toEqual({});
    expect(resolveAllowEnv([])).toEqual({});
  });

  it("copies every string-valued host var when true", () => {
    const prev = process.env.ADL_ALLOW_ENV_TEST;
    process.env.ADL_ALLOW_ENV_TEST = "secret";
    try {
      const env = resolveAllowEnv(true);
      expect(env.ADL_ALLOW_ENV_TEST).toBe("secret");
      expect(Object.keys(env).length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) {
        delete process.env.ADL_ALLOW_ENV_TEST;
      } else {
        process.env.ADL_ALLOW_ENV_TEST = prev;
      }
    }
  });

  it("keeps a literal name, a glob, and a RegExp match", () => {
    const keys = {
      ADL_ALLOW_ENV_FOO: "a",
      ADL_ALLOW_ENV_BAR: "b",
      OTHER_SECRET: "c",
    } as const;
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(keys)) {
      prev[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const env = resolveAllowEnv(["ADL_ALLOW_ENV_FOO", "ADL_ALLOW_ENV_*", /^OTHER_.*$/]);
      expect(env).toEqual({
        ADL_ALLOW_ENV_FOO: "a",
        ADL_ALLOW_ENV_BAR: "b",
        OTHER_SECRET: "c",
      });
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    }
  });
});

describe("canonicalizeAllowEnv", () => {
  it("sorts string and RegExp entries stably for pool keys", () => {
    expect(canonicalizeAllowEnv([/^B/, "A", /^A/])).toEqual([
      { kind: "regexp", source: "^A", flags: "" },
      { kind: "regexp", source: "^B", flags: "" },
      { kind: "string", value: "A" },
    ]);
    expect(canonicalizeAllowEnv(true)).toBe(true);
    expect(canonicalizeAllowEnv(undefined)).toEqual([]);
  });
});
