/**
 * OpenTelemetry integration (native API, not wrapped by ADL).
 *
 * ADL **pre-instruments** workflow runs, steps, and agent episodes by activating
 * OpenTelemetry context at those boundaries. User code should call **`@opentelemetry/api`
 * directly** — spans you start nest under the active ADL span without a parallel
 * ADL tracing API.
 *
 * ```ts
 * import { trace } from "@opentelemetry/api";
 *
 * await ctx.step("enrich", async () => {
 *   const tracer = trace.getTracer("my-app");
 *   const span = tracer.startSpan("fetch-metadata");
 *   try {
 *     // ...
 *   } finally {
 *     span.end();
 *   }
 * });
 * ```
 *
 * **Observers:** implement {@link WorkflowObserver.onEvent} / {@link AgentObserver.onEvent}
 * to export the same boundaries to your backend, or rely on auto-instrumentation if the
 * runtime registers OTel span processors when each event fires.
 *
 * **AI SDK:** pass `experimental_telemetry` on `streamText` / `generateText`; the agent
 * runner should attach the active OTel context so model and tool spans nest correctly.
 *
 * Install `@opentelemetry/api` (and your exporter SDK) in the **application** project —
 * `@agent-dev-lab/core` does not re-export or duplicate OTel types.
 */

/** Discriminator for docs / tooling — ADL uses native OTel context, not a wrapped span API. */
export const ADL_TRACING_MODE = "opentelemetry-native" as const;
