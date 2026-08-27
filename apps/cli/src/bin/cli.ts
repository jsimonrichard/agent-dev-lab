#!/usr/bin/env bun
import { run } from "@stricli/core";

import { app } from "../app";
import { buildContext } from "../context";
import { isBunRuntime, relaunchUnderBun } from "../ensure-bun";
import { writeCliError } from "../format-error";

try {
  if (!isBunRuntime()) {
    relaunchUnderBun(import.meta.url, process);
  }
  await run(app, process.argv.slice(2), buildContext(process));
} catch (error) {
  writeCliError(process, error);
  process.exitCode = 1;
}
