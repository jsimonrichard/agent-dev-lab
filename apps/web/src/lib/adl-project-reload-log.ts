import path from "node:path";

const ANSI = {
  dim: "\u001b[2m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  cyan: "\u001b[36m",
  reset: "\u001b[0m",
} as const;

export type AdlProjectReloadLogInput =
  | { type: "reload"; root: string; path?: string; now?: Date }
  | { type: "error"; message: string; now?: Date };

export function shouldColorAdlProjectReloadLog(
  env: NodeJS.ProcessEnv = process.env,
  stream: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env.NO_COLOR) {
    return false;
  }
  if (env.FORCE_COLOR) {
    return true;
  }
  return stream.isTTY === true;
}

export function formatAdlProjectReloadPath(root: string, filePath: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(filePath));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return filePath;
  }
  return rel;
}

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled) {
    return text;
  }
  return `${code}${text}${ANSI.reset}`;
}

/** Vite-shaped terminal line: `3:04:05 PM [adl] reload src/workflows/foo.ts`. */
export function formatAdlProjectReloadLog(
  input: AdlProjectReloadLogInput,
  options: { color?: boolean } = {},
): string {
  const color = options.color === true;
  const time = (input.now ?? new Date()).toLocaleTimeString();
  const tag = `${paint(color, ANSI.dim, time)} ${paint(color, ANSI.cyan, "[adl]")}`;
  if (input.type === "error") {
    return `${tag} ${paint(color, ANSI.red, "reload failed")} ${paint(color, ANSI.dim, input.message)}`;
  }
  const file =
    input.path === undefined ? undefined : formatAdlProjectReloadPath(input.root, input.path);
  if (file === undefined) {
    return `${tag} ${paint(color, ANSI.green, "reload")}`;
  }
  return `${tag} ${paint(color, ANSI.green, "reload")} ${paint(color, ANSI.dim, file)}`;
}

export function logAdlProjectReload(
  input: AdlProjectReloadLogInput,
  io: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream } = process,
): void {
  const color = shouldColorAdlProjectReloadLog();
  const line = `${formatAdlProjectReloadLog(input, { color })}\n`;
  if (input.type === "error") {
    (io.stderr ?? process.stderr).write(line);
    return;
  }
  (io.stdout ?? process.stdout).write(line);
}
