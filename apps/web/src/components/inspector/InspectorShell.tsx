import type { ReactNode } from "react";
import ProjectBanner from "./ProjectBanner";
import StartRunDialog from "./StartRunDialog";

interface InspectorShellProps {
  children: ReactNode;
  /** Optional workflow pre-selected in start dialog */
  startWorkflowId?: string;
  title?: string;
  actions?: ReactNode;
}

export default function InspectorShell({
  children,
  startWorkflowId,
  title,
  actions,
}: InspectorShellProps) {
  return (
    <>
      <ProjectBanner />
      {title ? (
        <div className="inspector-wrap flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="display-title m-0 text-2xl font-bold text-[var(--sea-ink)]">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <StartRunDialog defaultWorkflowId={startWorkflowId} />
          </div>
        </div>
      ) : null}
      <div className="inspector-wrap px-4 pb-10">{children}</div>
    </>
  );
}
