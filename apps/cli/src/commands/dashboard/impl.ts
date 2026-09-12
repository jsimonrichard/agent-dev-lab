import path from "node:path";

import type { AdlCliContext } from "../../context";
import { importProjectCore } from "../../resolve-packages";
import {
  adlProjectWatchEnvValue,
  resolveInspectionPort,
  resolveUiLaunchMode,
  shouldForwardUiChildSignals,
  spawnInspectionUi,
} from "../../ui-launch";

interface DashboardFlags {
  project?: string;
  port: number;
  serve: boolean;
  prebuilt: boolean;
  strictPort: boolean;
}

export default async function dashboard(this: AdlCliContext, flags: DashboardFlags): Promise<void> {
  const core = await importProjectCore(this.process.cwd());
  const projectRoot = path.resolve(
    flags.project ?? core.findAdlProjectRootFromCwd(this.process.cwd()),
  );
  const loaded = await core.loadAdlProject({ root: projectRoot });
  const mode = resolveUiLaunchMode({ prebuilt: flags.prebuilt, frameworkDev: false });
  const port = await resolveInspectionPort(flags.port, { strictPort: flags.strictPort });
  if (port !== flags.port) {
    this.process.stdout.write(`Port ${flags.port} is already in use; using ${port} instead.\n`);
  }

  this.process.stdout.write(
    `Starting inspection UI (${mode}) for "${loaded.config.name}" (${loaded.root})\n`,
  );

  const child = spawnInspectionUi({
    mode,
    port,
    env: {
      ...this.process.env,
      [core.ADL_PROJECT_ROOT_ENV]: loaded.root,
      [core.ADL_PROJECT_WATCH_ENV]: adlProjectWatchEnvValue({ serve: flags.serve }),
    },
  });

  // Stay alive on Ctrl+C so we can wait for the UI child's graceful exit.
  // In a TTY the child is in the same process group and receives SIGINT
  // itself. Without a TTY (packed e2e, `kill <pid>`), only this process is
  // signaled — forward so the Nitro/Vite child can shut down.
  const onSignal = (signal: NodeJS.Signals): void => {
    if (shouldForwardUiChildSignals(this.process.stdin)) {
      child.kill(signal);
    }
  };
  const onSigint = () => {
    onSignal("SIGINT");
  };
  const onSigterm = () => {
    onSignal("SIGTERM");
  };
  this.process.on("SIGINT", onSigint);
  this.process.on("SIGTERM", onSigterm);

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
    this.process.off("SIGINT", onSigint);
    this.process.off("SIGTERM", onSigterm);
  }
}
