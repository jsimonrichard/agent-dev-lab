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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { startInspectionWorkflowRun, fetchProjectMeta } from "#/lib/inspector/inspector-server";
import type { WorkflowInputField, WorkflowInspectorMeta } from "#/lib/inspector/inspector-types";
import { buildWorkflowInput, workflowInputValuesFromSample } from "#/lib/workflow/workflow-input-schema";

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
        <StartWorkflowDialog open={open} onOpenChange={setOpen} workflowId={workflowId} />
      ) : null}
    </>
  );
}

export function StartWorkflowDialog({
  open,
  onOpenChange,
  workflowId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}) {
  const { project } = useAppLoaderData();
  const [workflows, setWorkflows] = useState<WorkflowInspectorMeta[] | null>(null);

  useEffect(() => {
    if (!open) {
      setWorkflows(null);
      return;
    }

    let cancelled = false;
    void fetchProjectMeta().then((meta) => {
      if (!cancelled) {
        setWorkflows(meta.workflows);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, project.generation]);

  const resolvedWorkflows = workflows ?? project.workflows;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <StartWorkflowForm
          key={`${workflowId}:${project.generation}`}
          workflows={resolvedWorkflows}
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
  workflowId,
  active = true,
  variant = "page",
  onCancel,
  workflows: workflowsOverride,
}: {
  workflows?: WorkflowInspectorMeta[];
  workflowId?: string;
  /** When false, skip resetting — used so a closed dialog does not clobber state. */
  active?: boolean;
  variant?: "dialog" | "page";
  onCancel?: () => void;
}) {
  const { project } = useAppLoaderData();
  const workflows = workflowsOverride ?? project.workflows;
  const lockedId = workflowId;
  const formId = useId();
  const nameId = `${formId}-name`;
  const workflowSelectId = `${formId}-workflow`;
  const [selectedId, setSelectedId] = useState(lockedId ?? workflows[0]?.id ?? "");
  const [runName, setRunName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => workflows.find((workflow) => workflow.id === (lockedId ?? selectedId)),
    [workflows, lockedId, selectedId],
  );
  const fields = selected?.inputFields ?? [];
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    workflowInputValuesFromSample(fields, selected?.inputSample),
  );
  const description = startWorkflowDescription(lockedId, fields.length);
  const autoFocus = variant === "dialog";

  useEffect(() => {
    if (!active) {
      return;
    }
    const workflow = workflows.find((item) => item.id === (lockedId ?? workflows[0]?.id ?? ""));
    setSelectedId(lockedId ?? workflows[0]?.id ?? "");
    setRunName("");
    setValues(workflowInputValuesFromSample(workflow?.inputFields ?? [], workflow?.inputSample));
    setError(null);
    setSubmitting(false);
  }, [active, lockedId, workflows, project.generation]);

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
          <Select
            value={selectedId}
            onValueChange={(value) => {
              const next = workflows.find((workflow) => workflow.id === value);
              setSelectedId(value);
              setValues(workflowInputValuesFromSample(next?.inputFields ?? [], next?.inputSample));
              setError(null);
            }}
          >
            <SelectTrigger id={workflowSelectId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          Shown in the run list. The workflow can still override this title. The run id stays the
          same.
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

const UNSET_SELECT_VALUE = "__unset__";

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
        <Select
          value={typeof value === "string" && value !== "" ? value : undefined}
          onValueChange={(next) => onChange(next === UNSET_SELECT_VALUE ? "" : next)}
        >
          <SelectTrigger id={id} className="w-full" autoFocus={autoFocus}>
            <SelectValue placeholder={field.required ? "Select…" : "—"} />
          </SelectTrigger>
          <SelectContent>
            {field.required ? null : <SelectItem value={UNSET_SELECT_VALUE}>—</SelectItem>}
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
