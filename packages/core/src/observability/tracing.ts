/**
 * Minimal tracing surface so workflow code and OTel observers can share span boundaries.
 *
 * **OTel observer:** implement {@link WorkflowObserver.onEvent} and map events to spans
 * (workflow run → root span, `step_*` → child spans, `agent_*` → nested spans).
 * Use {@link WorkflowContext.trace} inside steps to attach custom attributes or child spans
 * that should live under the active step span.
 *
 * **AI SDK:** `generateText` / `streamText` accept `experimental_telemetry` (OpenTelemetry
 * integration when configured). The agent runner should forward the active trace context
 * into that option so model + tool spans nest under the ADL agent span.
 */

export type AdlSpan = {
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
};

export type StartSpanOptions = {
  attributes?: Record<string, string | number | boolean>;
};

/**
 * Per-workflow-run trace helpers. Implementations may wrap OpenTelemetry `context` / `trace`.
 */
export interface TraceContext {
  /**
   * Opaque active span for advanced integrations (e.g. OTel `Span`).
   * Observers set this when handling `step_started` / `agent_started`.
   */
  readonly activeSpan?: unknown;

  /** Start a child span; ended spans must call {@link AdlSpan.end}. */
  startSpan(name: string, options?: StartSpanOptions): AdlSpan;
}

/** No-op trace context for tests and projects without tracing. */
export function noopTraceContext(): TraceContext {
  const noopSpan: AdlSpan = {
    setAttribute() {},
    end() {},
  };
  return {
    startSpan() {
      return noopSpan;
    },
  };
}
