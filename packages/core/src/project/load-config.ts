import path from "node:path";

import { createJiti } from "jiti";

const JITI_CACHE_KEY = Symbol.for("@agent-dev-lab/core:adlConfigJitiCache");

function jitiCache(): Map<string, ReturnType<typeof createJiti>> {
  const g = process as typeof process & {
    [JITI_CACHE_KEY]?: Map<string, ReturnType<typeof createJiti>>;
  };
  if (!g[JITI_CACHE_KEY]) {
    g[JITI_CACHE_KEY] = new Map();
  }
  return g[JITI_CACHE_KEY]!;
}

function createProjectJiti(configPath: string): ReturnType<typeof createJiti> {
  const absoluteConfigPath = path.resolve(configPath);
  const projectRoot = path.dirname(absoluteConfigPath);
  const cache = jitiCache();

  const cached = cache.get(projectRoot);
  if (cached) {
    return cached;
  }

  // `tryNative` defaults to true under Bun and uses `import()`, whose ESM
  // cache never invalidates. Vite SSR can hit the same trap. Hot reload must
  // re-evaluate registry source, so always transpile via jiti and drop the
  // instance on bust (see {@link invalidateAdlConfigCache}).
  const jiti = createJiti(absoluteConfigPath, {
    interopDefault: true,
    moduleCache: true,
    fsCache: false,
    tryNative: false,
  });
  cache.set(projectRoot, jiti);
  return jiti;
}

function clearJitiModuleCache(jiti: ReturnType<typeof createJiti>): void {
  for (const key of Object.keys(jiti.cache)) {
    delete jiti.cache[key];
  }
}

/** Clear jiti's in-memory module cache for a project (used before hot reload). */
export function invalidateAdlConfigCache(projectRoot: string): void {
  const resolved = path.resolve(projectRoot);
  const cache = jitiCache();
  const jiti = cache.get(resolved);
  if (jiti) {
    clearJitiModuleCache(jiti);
    cache.delete(resolved);
  }
}

/** Load a TS/JS ADL config module with extensionless imports (via jiti). */
export async function importAdlConfigModule(
  configPath: string,
  options?: { bustCache?: boolean },
): Promise<unknown> {
  const absoluteConfigPath = path.resolve(configPath);
  const projectRoot = path.dirname(absoluteConfigPath);
  if (options?.bustCache) {
    invalidateAdlConfigCache(projectRoot);
  }

  const jiti = createProjectJiti(configPath);
  return jiti.import(absoluteConfigPath, { default: true });
}
