/** SSE event name for a server-side stream failure (shared by server encoder and client hooks). */
export const STREAM_ERROR_EVENT = "adl-error";

/** Parse an `adl-error` event body; malformed bodies still surface as an error. */
export function parseStreamError(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return { message: `Live updates stopped: ${data}` };
  }
}
