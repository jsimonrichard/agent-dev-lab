import { createLogger, type Logger } from "vite";

const RECOVERABLE_PROXY_RE =
  /(?:socket hang up|ECONNRESET|ECONNABORTED|EPIPE|ERR_STREAM_DESTROYED|other side closed)/i;

/**
 * Vite proxies long-lived SSE (`/api/project/events`, run tails) through Nitro.
 * Client reconnects and ADL hot-reload briefly drop those sockets; Vite otherwise
 * logs each as `Internal server error`. Filter the known-benign cases.
 */
export function createAdlViteLogger(): Logger {
  const logger = createLogger();
  const error = logger.error.bind(logger);
  logger.error = (msg, options) => {
    const text = typeof msg === "string" ? msg : String(msg);
    const errText = options?.error
      ? options.error instanceof Error
        ? `${options.error.message}\n${options.error.stack ?? ""}`
        : String(options.error)
      : "";
    if (RECOVERABLE_PROXY_RE.test(text) || RECOVERABLE_PROXY_RE.test(errText)) {
      return;
    }
    error(msg, options);
  };
  return logger;
}
