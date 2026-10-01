import { unlinkSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import {
  ADL_E2E_RESOLVED_PORT_ENV,
  DEFAULT_WEB_E2E_PORT,
  ephemeralStatePath,
  resolveE2ePort,
} from "./resolve-e2e-port";

describe("resolveE2ePort", () => {
  it("defaults to 3100 when ADL_E2E_PORT is unset or blank", () => {
    expect(resolveE2ePort(undefined)).toEqual({
      port: DEFAULT_WEB_E2E_PORT,
      ephemeral: false,
    });
    expect(resolveE2ePort("")).toEqual({
      port: DEFAULT_WEB_E2E_PORT,
      ephemeral: false,
    });
    expect(resolveE2ePort("  ")).toEqual({
      port: DEFAULT_WEB_E2E_PORT,
      ephemeral: false,
    });
  });

  it("uses a fixed port when given a positive integer", () => {
    expect(resolveE2ePort("3200")).toEqual({ port: 3200, ephemeral: false });
    expect(resolveE2ePort(" 1 ")).toEqual({ port: 1, ephemeral: false });
  });

  it("allocates an ephemeral port when set to 0 and pins it for reloads", () => {
    delete process.env[ADL_E2E_RESOLVED_PORT_ENV];
    try {
      unlinkSync(ephemeralStatePath());
    } catch {
      // no prior pin
    }

    const first = resolveE2ePort("0");
    expect(first.ephemeral).toBe(true);
    expect(first.port).toBeGreaterThan(0);
    expect(process.env[ADL_E2E_RESOLVED_PORT_ENV]).toBe(String(first.port));

    // Simulate a Playwright worker reloading the config with ADL_E2E_PORT=0.
    delete process.env[ADL_E2E_RESOLVED_PORT_ENV];
    const second = resolveE2ePort("0");
    expect(second).toEqual(first);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(() => resolveE2ePort("abc")).toThrow(/non-negative integer/);
    expect(() => resolveE2ePort("-1")).toThrow(/non-negative integer/);
    expect(() => resolveE2ePort("65536")).toThrow(/out of range/);
  });
});
