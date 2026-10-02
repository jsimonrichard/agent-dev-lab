import { registerTelemetry } from "ai";
import { OpenTelemetry } from "@ai-sdk/otel";

let registered = false;

/**
 * Registers AI SDK 7's `@ai-sdk/otel` integration once per process so
 * `streamText({ telemetry })` emits OpenTelemetry spans. Idempotent.
 *
 * Called from {@link createAdlRuntime} when telemetry is not disabled.
 * Hosts that already called `registerTelemetry` themselves still get a second
 * registration attempt only on the first ADL runtime create — the SDK keeps
 * the list of integrations; we gate with a process flag to avoid duplicates
 * from repeated `createAdlRuntime` calls.
 */
export function ensureAiSdkOpenTelemetryRegistered(): void {
  if (registered) {
    return;
  }
  registerTelemetry(new OpenTelemetry());
  registered = true;
}
