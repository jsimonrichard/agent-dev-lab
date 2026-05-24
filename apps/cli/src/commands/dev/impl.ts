import path from "node:path";

import type { AdlCliContext } from "../../context";
import { importProjectRuntimeProject } from "../../resolve-packages";
import { resolveUiLaunchMode, spawnInspectionUi } from "../../ui-launch";

interface DevFlags {
  project?: string;
  port: number;
  serve: boolean;
}

export default async function dev(this: AdlCliContext, flags: DevFlags): Promise<void> {
  const runtime = await importProjectRuntimeProject(this.process.cwd());
  const projectRoot = path.resolve(
    flags.project ?? runtime.findAdlProjectRootFromCwd(this.process.cwd()),
  );
  const loaded = await runtime.loadAdlProject({ root: projectRoot });
  const mode = resolveUiLaunchMode({ serve: flags.serve, frameworkDev: false });

  this.process.stdout.write(
    `Starting inspection UI (${mode}) for "${loaded.config.name}" (${loaded.root})\n`,
  );

  const child = spawnInspectionUi({
    mode,
    port: flags.port,
    env: {
      ...this.process.env,
      [runtime.ADL_PROJECT_ROOT_ENV]: loaded.root,
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
