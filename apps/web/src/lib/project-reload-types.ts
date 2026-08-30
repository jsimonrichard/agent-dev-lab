/** Client-safe project / inspector SSE payloads. */
export type ProjectReloadEvent =
  | { type: "snapshot"; generation: number; lastReloadError: string | null }
  | { type: "reload"; generation: number }
  | { type: "error"; generation: number; message: string }
  | { type: "server_shutdown"; reason: "graceful" | "forced" };
