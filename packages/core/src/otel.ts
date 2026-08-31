/**
 * OpenTelemetry wiring is intentionally shallow for now — export names preserve
 * a single import site for future SDK setup without coupling apps to vendor yet.
 */
export const OTEL_SERVICE_NAME = "agent-development-lab";

export function createOtelPlaceholder(): { note: string } {
  return {
    note: "Wire @opentelemetry/sdk-node here when the event model is defined.",
  };
}
