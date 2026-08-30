import path from "node:path";

import type { AdlCliContext } from "../../context";
import { importProjectCore } from "../../resolve-packages";
import { resolveUiLaunchMode, spawnInspectionUi } from "../../ui-launch";

interface DashboardFlags {
  project?: string;
  port: number;
  serve: boolean;
}

export default async function dashboard(this: AdlCliContext, flags: DashboardFlags): Promise<void> {
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

  // Stay alive on Ctrl+C so we can wait for the UI child's graceful exit.
  // The child is in the same process group and receives SIGINT itself (serve
  // path) or via the terminal (vite). Without this, the CLI exits first and
  // the shell races the still-shutting-down server.
  const ignoreSignal = () => {};
  this.process.on("SIGINT", ignoreSignal);
  this.process.on("SIGTERM", ignoreSignal);

  try {
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          // Terminated by signal after shutdown / force-kill — treat as success
          // when the user interrupted (SIGINT/SIGTERM).
          if (signal === "SIGINT" || signal === "SIGTERM") {
            resolve();
            return;
          }
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
  } finally {
    this.process.off("SIGINT", ignoreSignal);
    this.process.off("SIGTERM", ignoreSignal);
  }
}
