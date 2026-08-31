import pino from "pino";

/** JSON logging baseline; wide structured fields can be added at call sites. */
export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
  });
}

export type Logger = ReturnType<typeof createLogger>;
