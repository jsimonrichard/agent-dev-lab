import path from "node:path";

import { createJiti } from "jiti";

const jitiCache = new Map<string, ReturnType<typeof createJiti>>();

function projectJiti(configPath: string): ReturnType<typeof createJiti> {
  const absoluteConfigPath = path.resolve(configPath);
  const projectRoot = path.dirname(absoluteConfigPath);
  const cached = jitiCache.get(projectRoot);
  if (cached) {
    return cached;
  }

  const jiti = createJiti(absoluteConfigPath, {
    interopDefault: true,
  });
  jitiCache.set(projectRoot, jiti);
  return jiti;
}

/** Load a TS/JS ADL config module with extensionless imports (via jiti). */
export async function importAdlConfigModule(configPath: string): Promise<unknown> {
  const jiti = projectJiti(configPath);
  return jiti.import(path.resolve(configPath), { default: true });
}
