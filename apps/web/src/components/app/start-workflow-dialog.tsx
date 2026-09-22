import { useEffect, useId, useMemo, useState, type ComponentProps, type FormEvent } from "react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { ErrorDetails } from "@/components/app/error-details";
import { JsonTextEditor } from "@/components/app/json-editor";
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
import { startInspectionWorkflowRun, fetchProjectMeta } from "#/lib/inspector/inspector-server";
import type { WorkflowInspectorMeta } from "#/lib/inspector/inspector-types";
import type { JsonValue } from "#/lib/view-model/types";
import {
  jsonTextError,
  jsonTypeFromFields,
  parseJsonText,
  stringifyJsonValue,
} from "@/lib/json-editor";
import { cn } from "@/lib/utils";

function workflowInputRawJson(sample: JsonValue | undefined): string {
  return sample === undefined ? "{}" : stringifyJsonValue(sample);
}

/** Empty editor text is treated as `{}` so required fields still fail closed. */
function workflowInputJsonError(
  rawJson: string,
  inputType: ReturnType<typeof jsonTypeFromFields>,
): string | null {
  return jsonTextError(rawJson.trim().length === 0 ? "{}" : rawJson, inputType);
}

async function startWorkflowAndOpen(workflowId: string, input: unknown = {}, title?: string) {
  const result = await startInspectionWorkflowRun({
    data: { workflowId, input, title },
  });
  if (result.isErr) {
    throw new Error(result.error);
  }
  window.location.href = `/workflows/${workflowId}/run/${result.value.runId}`;
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
      <DialogContent className="max-h-[min(85vh,48rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
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
  const inputType = fields.length > 0 ? jsonTypeFromFields(fields) : undefined;
  const [rawJson, setRawJson] = useState(() => workflowInputRawJson(selected?.inputSample));
  const [jsonFieldError, setJsonFieldError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const description = startWorkflowDescription(lockedId, fields.length);
  const autoFocus = variant === "dialog";
  const jsonError =
    inputType === undefined ? null : (workflowInputJsonError(rawJson, inputType) ?? jsonFieldError);

  useEffect(() => {
    if (!active) {
      return;
    }
    const workflow = workflows.find((item) => item.id === (lockedId ?? workflows[0]?.id ?? ""));
    setSelectedId(lockedId ?? workflows[0]?.id ?? "");
    setRunName("");
    setRawJson(workflowInputRawJson(workflow?.inputSample));
    setJsonFieldError(null);
    setSubmitAttempted(false);
    setError(null);
    setSubmitting(false);
  }, [active, lockedId, workflows, project.generation]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    setSubmitAttempted(true);
    if (jsonError !== null) {
      setError(jsonError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      let input: unknown = {};
      if (fields.length > 0) {
        const parsed = parseJsonText(rawJson.trim().length === 0 ? "{}" : rawJson);
        if (parsed.isErr) {
          throw new Error(parsed.error);
        }
        input = parsed.value ?? {};
      }
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
        <DialogTitle>Start Workflow</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
    ) : (
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Start Workflow</h2>
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
              setRawJson(workflowInputRawJson(next?.inputSample));
              setJsonFieldError(null);
              setSubmitAttempted(false);
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
        <Label htmlFor={nameId}>Name (Optional)</Label>
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

      {inputType ? (
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-input`}>Input</Label>
          <div className={cn(variant === "page" && "flex min-h-[min(24rem,50vh)] flex-col")}>
            <JsonTextEditor
              id={`${formId}-input`}
              autoFocus={autoFocus}
              title="Workflow input"
              presentation="inline"
              fill={variant === "page"}
              jsonType={inputType}
              value={rawJson}
              onChange={setRawJson}
              showErrors={submitAttempted}
              onValidityChange={setJsonFieldError}
            />
          </div>
        </div>
      ) : null}

      {error || (submitAttempted && jsonError) ? (
        <ErrorDetails error={error ?? jsonError} compact />
      ) : null}

      {actions}
    </form>
  );
}
