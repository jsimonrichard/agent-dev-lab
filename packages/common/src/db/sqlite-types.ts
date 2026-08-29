/**
 * Minimal sync SQLite surface shared by bun:sqlite and better-sqlite3.
 * Call sites use prepare/get/all/run/exec only.
 */
export type AdlSqliteStatement = {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
};

export type AdlSqliteDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): AdlSqliteStatement;
};
