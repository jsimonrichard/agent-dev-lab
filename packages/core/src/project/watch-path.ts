import path from "node:path";

import { ADL_CONFIG_FILENAMES, type AdlConfigFilename } from "./config";

const RELOAD_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".md", ".markdown"]);

const IGNORED_SEGMENTS = new Set(["node_modules", ".git", ".data", "dist", ".output", ".turbo"]);

const EDITOR_TEMP_SUFFIX = /(?:~|\.(?:tmp|bak|swp|swx|orig|partial)(?:\.[^.]+)?)$/i;

/** Directory names that must not be subscribed by {@link watchAdlProject}. */
export function isIgnoredAdlProjectSegment(segment: string): boolean {
  return IGNORED_SEGMENTS.has(segment);
}

function hasReloadableSourceStem(base: string): boolean {
  const name = base.replace(/~$/, "");
  for (const ext of RELOAD_EXTENSIONS) {
    if (name.endsWith(ext) || name.includes(`${ext}.`)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a filesystem path under an ADL project should trigger a registry reload.
 * Ignores dependency/build/data dirs (including SQLite WAL files under `.data/`).
 * Editor atomic-save temps (`*.ts.tmp`, `*.ts.12345.tmp`, `*~`) count as the source file.
 */
export function shouldReloadAdlProjectPath(filePath: string, projectRoot: string): boolean {
  const resolved = path.resolve(filePath);
  const root = path.resolve(projectRoot);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || relative.length === 0) {
    return false;
  }

  const segments = relative.split(path.sep);
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return false;
  }

  const base = path.basename(relative);
  if (ADL_CONFIG_FILENAMES.includes(base as AdlConfigFilename)) {
    return true;
  }

  const ext = path.extname(relative).toLowerCase();
  if (RELOAD_EXTENSIONS.has(ext)) {
    return true;
  }

  return EDITOR_TEMP_SUFFIX.test(base) && hasReloadableSourceStem(base);
}
