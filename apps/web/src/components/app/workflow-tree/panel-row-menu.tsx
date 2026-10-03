import { Link } from "@tanstack/react-router";
import { ExternalLink, RotateCcw, SquareArrowOutUpRight } from "lucide-react";

import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import type { InspectorRunSummary } from "@/lib/view-model/types";
import { workflowRunSearch } from "@/lib/workflow/workflow-location";

export type RowMenu =
  | {
      kind: "step";
      stepId: string;
      ownerRunId: string;
      showRetry: boolean;
      replayedFromStepId: string | null;
      priorRunId: string | null;
      workflowId: string;
    }
  | { kind: "nested"; run: InspectorRunSummary }
  | { kind: "workflow" };

export function PanelRowMenu({
  menu,
  onRetryFromStep,
  onRetryWorkflow,
  onOpenNestedRunPage,
}: {
  menu: RowMenu | null;
  onRetryFromStep: (stepId: string, ownerRunId: string) => void;
  onRetryWorkflow: () => void;
  onOpenNestedRunPage: (run: InspectorRunSummary) => void;
}) {
  if (!menu) return null;
  if (menu.kind === "workflow") {
    return (
      <ContextMenuItem onSelect={() => onRetryWorkflow()}>
        <RotateCcw className="mr-2 size-4" />
        Retry
      </ContextMenuItem>
    );
  }
  if (menu.kind === "step") {
    return (
      <>
        {menu.showRetry ? (
          <ContextMenuItem onSelect={() => onRetryFromStep(menu.stepId, menu.ownerRunId)}>
            <RotateCcw className="mr-2 size-4" />
            Retry from here
          </ContextMenuItem>
        ) : null}
        {menu.replayedFromStepId && menu.priorRunId ? (
          <>
            {menu.showRetry ? <ContextMenuSeparator /> : null}
            <ContextMenuItem asChild>
              <Link
                to="/workflows/$workflowId/run/$runId"
                params={{ workflowId: menu.workflowId, runId: menu.priorRunId }}
                search={workflowRunSearch({ step: menu.replayedFromStepId })}
              >
                <SquareArrowOutUpRight className="mr-2 size-4" />
                View original step
              </Link>
            </ContextMenuItem>
          </>
        ) : null}
      </>
    );
  }
  return (
    <>
      <ContextMenuItem onSelect={() => onOpenNestedRunPage(menu.run)}>
        <ExternalLink className="mr-2 size-4" />
        View run separately
      </ContextMenuItem>
      {menu.run.replayOfRunId ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() =>
              onOpenNestedRunPage({
                ...menu.run,
                runId: menu.run.replayOfRunId!,
              })
            }
          >
            <SquareArrowOutUpRight className="mr-2 size-4" />
            View original run
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}
