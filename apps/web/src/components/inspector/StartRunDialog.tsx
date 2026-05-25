import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { mockWorkflows } from "#/lib/mock/data";

interface StartRunDialogProps {
  defaultWorkflowId?: string;
}

/** Mock start flow — navigates to a canned run id until server fn exists. */
export default function StartRunDialog({ defaultWorkflowId }: StartRunDialogProps) {
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState(defaultWorkflowId ?? mockWorkflows[0]?.id ?? "");
  const [inputJson, setInputJson] = useState('{\n  "topic": "CRISPR delivery"\n}');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.18)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] hover:bg-[rgba(79,184,178,0.28)]"
      >
        Start workflow
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(23,58,64,0.35)] p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-run-title"
        >
          <div className="island-shell w-full max-w-md rounded-2xl p-6">
            <h2 id="start-run-title" className="mb-1 text-lg font-semibold text-[var(--sea-ink)]">
              Start workflow
            </h2>
            <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
              Mock control plane — will call <code>startInspectionRun</code> later.
            </p>

            <label className="mb-3 block text-sm font-medium text-[var(--sea-ink)]">
              Workflow
              <select
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm"
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
              >
                {mockWorkflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-4 block text-sm font-medium text-[var(--sea-ink)]">
              Input (JSON)
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 font-mono text-xs"
                rows={5}
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <Link
                to="/runs/$runId"
                params={{ runId: "run_01H9ZL" }}
                className="rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.22)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline hover:bg-[rgba(79,184,178,0.32)]"
                onClick={() => setOpen(false)}
              >
                Start (mock)
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
