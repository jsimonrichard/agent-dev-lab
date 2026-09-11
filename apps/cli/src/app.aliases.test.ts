import { describe, expect, it } from "bun:test";
import path from "node:path";

import { adlMonorepoRootFromCli } from "./paths";

async function cliHelp(...args: string[]): Promise<string> {
  const cliRoot = path.resolve(adlMonorepoRootFromCli(), "apps/cli");
  const proc = Bun.spawn(["bun", "run", "src/bin/cli.ts", ...args, "--help"], {
    cwd: cliRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const text = `${stdout}\n${stderr}`;
  expect(exitCode, text).toBe(0);
  return text;
}

describe("adl command aliases", () => {
  it("resolves i to init", async () => {
    const help = await cliHelp("i");
    expect(help).toContain("Scaffold a new ADL project");
    expect(help).toContain("adl init");
    expect(help).toContain("-g");
    expect(help).toContain("-l");
  });

  it("resolves a l / w l to list and a r / w r to run", async () => {
    const agentList = await cliHelp("a", "l");
    expect(agentList).toContain("List agent ids in the current project");
    expect(agentList).toContain("adl a list");
    expect(agentList).toContain("-p");

    const workflowList = await cliHelp("w", "l");
    expect(workflowList).toContain("List workflow ids in the current project");
    expect(workflowList).toContain("adl w list");
    expect(workflowList).toContain("-p");

    const agentRun = await cliHelp("a", "r");
    expect(agentRun).toContain("Run an agent from the project registry");
    expect(agentRun).toContain("-i");
    expect(agentRun).toContain("-s");

    const workflowRun = await cliHelp("w", "r");
    expect(workflowRun).toContain("Run a workflow from the project registry");
    expect(workflowRun).toContain("-i");
  });

  it("exposes dashboard flag aliases including -P when -p is project", async () => {
    const help = await cliHelp("d");
    expect(help).toContain("Start the inspection UI for an ADL project");
    expect(help).toMatch(/-p\s+\[--project\]/);
    expect(help).toMatch(/-P\s+\[--port\]/);
    expect(help).toMatch(/-s\s+\[--serve\]/);
    expect(help).toMatch(/-b\s+\[--prebuilt\]/);
  });

  it("parses -p as --project", async () => {
    const cliRoot = path.resolve(adlMonorepoRootFromCli(), "apps/cli");
    const missing = "/tmp/definitely-not-an-adl-project-xyz";
    const proc = Bun.spawn(["bun", "run", "src/bin/cli.ts", "a", "l", "-p", missing], {
      cwd: cliRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const text = `${stdout}\n${stderr}`;
    expect(exitCode, text).toBe(1);
    expect(text).toContain(`No ADL project config found in ${missing}`);
  });
});
