const EXTRA_KEYS = ["code", "statusCode", "url", "responseBody", "cause"] as const;

/** JSON-safe error payload for workflow/agent run events. */
export function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    const rec = error as unknown as Record<string, unknown>;
    for (const key of EXTRA_KEYS) {
      if (rec[key] === undefined) {
        continue;
      }
      payload[key] = key === "cause" ? serializeError(rec[key]) : rec[key];
    }
    return payload;
  }
  return error;
}
