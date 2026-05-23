import { spawn } from "node:child_process";
import path from "node:path";

import { ADL_PROJECT_ROOT_ENV, loadAdlProject } from "@agent-dev-lab/runtime/project";

import type { AdlCliContext } from "../../context";
import { webPackageRoot } from "../../paths";

interface DevFlags {
  project?: string;
  port: number;
}

export default async function dev(this: AdlCliContext, flags: DevFlags): Promise<void> {
  const projectRoot = path.resolve(flags.project ?? this.defaultProjectRoot);
  const loaded = await loadAdlProject({ root: projectRoot });

  this.process.stdout.write(
    `Starting inspection UI for "${loaded.config.name}" (${loaded.root})\n`,
  );

  const webRoot = webPackageRoot();
  const child = spawn("bun", ["run", "dev", "--", "--port", String(flags.port)], {
    cwd: webRoot,
    env: {
      ...this.process.env,
      [ADL_PROJECT_ROOT_ENV]: loaded.root,
    },
    stdio: "inherit",
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
