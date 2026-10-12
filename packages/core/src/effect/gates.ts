import type { EffectGate, EffectHandler } from "./types";

/**
 * Accept-all gate for tests, CI, and permissive local hosts. Tool factories and providers
 * take their gate as a required argument and never fall back to this. `createAdlRuntime`
 * uses it as the host policy when `effectGate` is omitted; the debugger handler still runs
 * first, and tools only see that chain when handed `runtime.services.effectGate`.
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
