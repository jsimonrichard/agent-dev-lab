import type { RunStatus } from "#/lib/mock/types";

const styles: Record<RunStatus, string> = {
  running: "border-[rgba(79,184,178,0.45)] bg-[rgba(79,184,178,0.16)] text-[var(--lagoon-deep)]",
  completed: "border-[rgba(47,106,74,0.35)] bg-[rgba(47,106,74,0.12)] text-[var(--palm)]",
  failed: "border-[rgba(220,80,80,0.35)] bg-[rgba(220,80,80,0.1)] text-red-700 dark:text-red-300",
  cancelled: "border-[var(--line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]",
};

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
