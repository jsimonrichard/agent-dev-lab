#!/usr/bin/env node
import { run } from "@stricli/core";

import { app } from "../app";
import { buildContext } from "../context";
import { writeCliError } from "../format-error";

try {
  await run(app, process.argv.slice(2), buildContext(process));
} catch (error) {
  writeCliError(process, error);
  process.exitCode = 1;
}
