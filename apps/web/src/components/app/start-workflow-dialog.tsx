import { useEffect, useId, useMemo, useState, type ComponentProps, type FormEvent } from "react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { ErrorDetails } from "@/components/app/error-details";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startInspectionWorkflowRun } from "#/lib/inspector-server";
import type { WorkflowInputField, WorkflowInspectorMeta } from "#/lib/inspector-types";
import { buildWorkflowInput } from "#/lib/workflow-input-schema";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
);

async function startWorkflowAndOpen(workflowId: string, input: unknown = {}, title?: string) {
  const { runId } = await startInspectionWorkflowRun({
    data: { workflowId, input, title },
  });
  window.location.href = `/workflows/${workflowId}/run/${runId}`;
}

function startWorkflowDescription(workflowId: string | undefined, fieldCount: number): string {
  if (workflowId) {
    return fieldCount > 0
      ? `Optionally name this run and provide input for ${workflowId}.`
      : `Optionally name this run of ${workflowId}.`;
  }
  return fieldCount > 0
    ? "Choose a workflow, optionally name the run, and provide any required input."
    : "Choose a workflow and optionally name the run.";
}

export function StartWorkflowButton({
  workflowId,
  children,
  ...props
}: {
  workflowId: string;
} & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [open, setOpen] = useState(false);
  const { project } = useAppLoaderData();
  const workflow = project.workflows.find((item) => item.id === workflowId);

  return (
    <>
      <Button
        {...props}
        type="button"
        disabled={props.disabled || !workflow}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      {workflow ? (
        <StartWorkflowDialog
          open={open}
          onOpenChange={setOpen}
          workflows={project.workflows}
          workflowId={workflowId}
        />
      ) : null}
    </>
  );
}

export function StartWorkflowDialog({
  open,
  onOpenChange,
  workflows,
  workflowId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflows: WorkflowInspectorMeta[];
  workflowId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <StartWorkflowForm
          workflows={workflows}
          workflowId={workflowId}
          active={open}
          variant="dialog"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function StartWorkflowForm({
  workflows,
  workflowId,
  active = true,
  variant = "page",
  onCancel,
}: {
  workflows: WorkflowInspectorMeta[];
  workflowId?: string;
  /** When false, skip resetting — used so a closed dialog does not clobber state. */
  active?: boolean;
  variant?: "dialog" | "page";
  onCancel?: () => void;
}) {
  const lockedId = workflowId;
  const formId = useId();
  const nameId = `${formId}-name`;
  const workflowSelectId = `${formId}-workflow`;
  const [selectedId, setSelectedId] = useState(lockedId ?? workflows[0]?.id ?? "");
  const [runName, setRunName] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => workflows.find((workflow) => workflow.id === (lockedId ?? selectedId)),
    [workflows, lockedId, selectedId],
  );
  const fields = selected?.inputFields ?? [];
  const description = startWorkflowDescription(lockedId, fields.length);
  const autoFocus = variant === "dialog";

  useEffect(() => {
    if (!active) {
      return;
    }
    setSelectedId(lockedId ?? workflows[0]?.id ?? "");
    setRunName("");
    setValues({});
    setError(null);
    setSubmitting(false);
  }, [active, lockedId, workflows]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const input = buildWorkflowInput(fields, values);
      const title = runName.trim() || undefined;
      await startWorkflowAndOpen(selected.id, input, title);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  }

  const heading =
    variant === "dialog" ? (
      <DialogHeader>
        <DialogTitle>Start workflow</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
    ) : (
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Start workflow</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    );

  const actions =
    variant === "dialog" ? (
      <DialogFooter>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting || !selected}>
          {submitting ? "Starting…" : "Start run"}
        </Button>
      </DialogFooter>
    ) : (
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !selected}>
          {submitting ? "Starting…" : "Start run"}
        </Button>
      </div>
    );

  return (
    <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
      {heading}

      {lockedId ? null : (
        <div className="grid gap-2">
          <Label htmlFor={workflowSelectId}>Workflow</Label>
          <select
            id={workflowSelectId}
            className={selectClassName}
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setValues({});
              setError(null);
            }}
          >
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={nameId}>Name (optional)</Label>
        <Input
          id={nameId}
          autoFocus={autoFocus && fields.length === 0}
          value={runName}
          onChange={(event) => setRunName(event.target.value)}
          placeholder="Leave blank to use the run id"
        />
        <p className="text-xs text-muted-foreground">
          Shown in the run list. The run id stays the same.
        </p>
      </div>

      {fields.map((field, index) => (
        <WorkflowInputControl
          key={field.name}
          idPrefix={formId}
          field={field}
          autoFocus={autoFocus && index === 0}
          value={values[field.name]}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
        />
      ))}

      {error ? <ErrorDetails error={error} compact /> : null}

      {actions}
    </form>
  );
}

function WorkflowInputControl({
  idPrefix,
  field,
  value,
  onChange,
  autoFocus,
}: {
  idPrefix: string;
  field: WorkflowInputField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  autoFocus?: boolean;
}) {
  const id = `${idPrefix}-${field.name}`;
  const label = field.required ? field.name : `${field.name} (optional)`;

  if (field.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="size-4 rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <select
          id={id}
          autoFocus={autoFocus}
          required={field.required}
          className={selectClassName}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{field.required ? "Select…" : "—"}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  if (field.kind === "json") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          autoFocus={autoFocus}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20 font-mono text-xs"
          spellCheck={false}
        />
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoFocus={autoFocus}
        required={field.required}
        type={field.kind === "number" ? "number" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}
