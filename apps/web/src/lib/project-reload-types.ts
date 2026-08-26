/** Client-safe project hot-reload SSE payloads. */
export type ProjectReloadEvent =
  | { type: "snapshot"; generation: number; lastReloadError: string | null }
  | { type: "reload"; generation: number }
  | { type: "error"; generation: number; message: string };
