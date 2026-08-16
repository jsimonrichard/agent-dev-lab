function isNamedAdlError(error: unknown): error is { name: string; code: string; message: string } {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "AdlError" &&
    "message" in error,
  );
}

export function writeCliError(proc: NodeJS.Process, error: unknown): void {
  if (isNamedAdlError(error) || error instanceof Error) {
    proc.stderr.write(`${error.message}\n`);
  } else {
    proc.stderr.write(`${String(error)}\n`);
  }
  if (proc.env.DEBUG === "adl" && error instanceof Error && error.stack) {
    proc.stderr.write(`${error.stack}\n`);
  }
}
