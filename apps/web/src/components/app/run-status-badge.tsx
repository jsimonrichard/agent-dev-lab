import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/mock/types";

const variantByStatus: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  completed: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={variantByStatus[status]} className="capitalize">
      {status}
    </Badge>
  );
}
