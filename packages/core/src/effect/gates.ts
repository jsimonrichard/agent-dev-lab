import type { EffectGate, EffectHandler } from "./types";

/**
 * Explicit accept-all gate for tests, CI, and permissive local hosts.
 * Must be passed deliberately — never the ambient default when a gate is omitted.
 */
export const allowAllGate: EffectGate = {
  handle() {
    return Promise.resolve({ action: "allow" });
  },
};

/** Same policy as {@link allowAllGate}, as a handler for {@link composeEffectHandlers}. */
export const allowAllHandler: EffectHandler = {
  onIntent() {
    return Promise.resolve({ action: "allow" });
  },
};
