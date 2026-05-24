import { notImplemented } from "../internal/not-implemented";
import type { CreateRunContextOptions, RunContext } from "./types";
import type { LoadedAdlProject } from "../project/resolve";

export function createRunContext(
  project: LoadedAdlProject,
  options?: CreateRunContextOptions,
): RunContext {
  void project;
  void options;
  notImplemented("createRunContext");
}
