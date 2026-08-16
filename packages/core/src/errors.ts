export type AdlErrorCode =
  | "PROJECT_NOT_FOUND"
  | "INVALID_CONFIG"
  | "UNKNOWN_WORKFLOW"
  | "UNKNOWN_AGENT"
  | "INVALID_INPUT"
  | "MISSING_RUNTIME"
  | "MISSING_MODEL"
  | "INIT_FAILED";

/** Typed ADL error for CLI and host mapping. */
export class AdlError extends Error {
  readonly code: AdlErrorCode;

  constructor(code: AdlErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AdlError";
    this.code = code;
  }
}

export function isAdlError(error: unknown): error is AdlError {
  return error instanceof AdlError;
}
