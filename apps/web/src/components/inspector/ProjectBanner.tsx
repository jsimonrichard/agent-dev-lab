import { mockProject } from "#/lib/mock/data";
import type { DevMode } from "#/lib/mock/types";

const devModeLabels: Record<DevMode, string> = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Production serve",
};

export default function ProjectBanner() {
  const p = mockProject;

  return (
    <div className="border-b border-[var(--line)] bg-[var(--header-bg)] px-4 py-2.5">
      <div className="inspector-wrap flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="island-kicker text-[0.62rem]">Loaded project</span>
          <span className="truncate font-semibold text-[var(--sea-ink)]">{p.name}</span>
        </div>
        <div className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex">
          <span className="island-kicker text-[0.62rem]">Root</span>
          <code className="truncate text-xs text-[var(--sea-ink-soft)]">{p.root}</code>
        </div>
        <span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)]">
          {devModeLabels[p.devMode]}
        </span>
        <span
          className="text-xs text-[var(--sea-ink-soft)]"
          title="Mock — show version skew warning when wired"
        >
          @agent-dev-lab/core {p.coreVersion}
        </span>
        <button
          type="button"
          className="ml-auto rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-semibold text-[var(--sea-ink)] hover:border-[var(--lagoon-deep)]"
          title="Mock — reload project after file changes"
        >
          Reload project
        </button>
      </div>
    </div>
  );
}
