import path from "node:path";

import type { AdlCliContext } from "../../context";
import { importProjectCore } from "../../resolve-packages";
import { resolveUiLaunchMode, spawnInspectionUi } from "../../ui-launch";

interface DashboardFlags {
  project?: string;
  port: number;
  serve: boolean;
}

export default async function dashboard(
  this: AdlCliContext,
  flags: DashboardFlags,
): Promise<void> {
  const core = await importProjectCore(this.process.cwd());
  const projectRoot = path.resolve(
    flags.project ?? core.findAdlProjectRootFromCwd(this.process.cwd()),
  );
  const loaded = await core.loadAdlProject({ root: projectRoot });
  const mode = resolveUiLaunchMode({ serve: flags.serve, frameworkDev: false });

  this.process.stdout.write(
    `Starting inspection UI (${mode}) for "${loaded.config.name}" (${loaded.root})\n`,
  );

  const child = spawnInspectionUi({
    mode,
    port: flags.port,
    env: {
      ...this.process.env,
      [core.ADL_PROJECT_ROOT_ENV]: loaded.root,
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Inspection UI exited from signal ${signal}`));
        return;
      }
      if (code !== 0 && code !== null) {
        reject(new Error(`Inspection UI exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}
