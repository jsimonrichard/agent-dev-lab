export interface FormattedError {
  message: string;
  name?: string;
  code?: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** Turns a serialized run/step/agent error into fields the inspector can render. */
export function formatSerializedError(error: unknown): FormattedError {
  if (error == null) {
    return { message: "Unknown error" };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error instanceof Error) {
    return formatSerializedError({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }

  const rec = asRecord(error);
  if (!rec) {
    return { message: String(error) };
  }

  const message =
    typeof rec.message === "string" && rec.message.length > 0 ? rec.message : undefined;
  const name = typeof rec.name === "string" ? rec.name : undefined;
  const code = typeof rec.code === "string" ? rec.code : undefined;
  const stack = typeof rec.stack === "string" ? rec.stack : undefined;
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (key === "message" || key === "name" || key === "code" || key === "stack") {
      continue;
    }
    extra[key] = value;
  }

  return {
    message: message ?? (name ? `${name} failed` : JSON.stringify(error)),
    name,
    code,
    stack,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function formatSerializedErrorHeadline(error: unknown): string {
  const formatted = formatSerializedError(error);
  const prefix = [formatted.name, formatted.code].filter(Boolean).join(" ");
  return prefix ? `${prefix}: ${formatted.message}` : formatted.message;
}
