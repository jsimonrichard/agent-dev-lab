import {
  Braces,
  Cpu,
  Database,
  FileText,
  GitBranch,
  MessageSquare,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";

import type { AgentInspectorMeta } from "#/lib/inspector/inspector-types";
import { buildToolProviderContextInput } from "#/lib/agent/agent-tools";
import type { ResolvedAgentConversation } from "@/lib/view-model/types";
import { RunTagsFooter } from "@/components/app/run-tags-footer";
import { Badge } from "@/components/ui/badge";
import { ErrorDetails } from "@/components/app/error-details";
import { InspectorNoun } from "@/components/app/inspector-noun";
import { SettingRow, SettingsSection } from "@/components/app/inspector-settings";
import { JsonPreview } from "@/components/app/json-preview";
import { MarkdownContent } from "@/components/app/markdown-content";
import {
  JsonEditorSummary,
  JsonSchemaRawEditor,
  JsonTextEditor,
  ModeToggle,
} from "@/components/app/json-editor";
import { SchemaFieldControl } from "@/components/app/schema-field-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  buildWorkflowInput,
  workflowInputValuesFromSample,
} from "#/lib/workflow/workflow-input-schema";
import {
  jsonTextError,
  jsonTypeFromFields,
  parseJsonText,
  toolProviderContextJsonError,
  type ContextEditorSource,
} from "@/lib/json-editor";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";

export interface ToolProviderContextFormState {
  values: Record<string, string | boolean>;
  rawJson: string;
  onValuesChange: (values: Record<string, string | boolean>) => void;
  onRawJsonChange: (rawJson: string) => void;
  /** Form fields vs a single JSON document for the whole context object. */
  source: ContextEditorSource;
  onSourceChange: (source: ContextEditorSource) => void;
  /** `"default"` = agent definition page; `"turn"` = conversation next-turn draft. */
  purpose?: "default" | "turn";
  /** Persist the default. Required when `purpose` is `"default"`. */
  onSave?: () => Promise<boolean>;
  saving?: boolean;
  saveError?: string | null;
}

/** Historical episode snapshot shown when inspecting `?call=` or a workflow-linked chat. */
export interface EpisodeToolProviderContextView {
  /** Null means the episode exists but context was never recorded. */
  value: unknown | null;
  /** When set, show a control that copies this snapshot into the next-turn draft. */
  onCopyToNextTurn?: () => void;
}

interface AgentSettingsPanelProps {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
  contextForm?: ToolProviderContextFormState;
  episodeToolContext?: EpisodeToolProviderContextView;
}

export function AgentSettingsPanel({
  settings,
  conversation,
  contextForm,
  episodeToolContext,
}: AgentSettingsPanelProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Agent Settings</h2>
        <p className="text-xs text-muted-foreground">Configuration for this agent</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <AgentConfigBody
            settings={settings}
            conversation={conversation}
            contextForm={contextForm}
            episodeToolContext={episodeToolContext}
          />
        </div>
      </ScrollArea>
      {conversation ? <RunTagsFooter tags={conversation.tags} /> : null}
    </div>
  );
}

export function AgentConfigBody({
  settings,
  conversation,
  contextForm,
  episodeToolContext,
}: {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
  contextForm?: ToolProviderContextFormState;
  episodeToolContext?: EpisodeToolProviderContextView;
}) {
  const fork = conversation?.forkSession;
  const workflowLink = conversation?.workflowLink;
  const sourceScopeLabel = fork
    ? formatMemoryScopeLabel(fork.sourceMemoryScope, fork.sourceRunId)
    : null;
  const prompt = settings.systemPrompt;
  const promptText = prompt.isOk ? prompt.value.trim() : "";
  const showPromptSection =
    !conversation && (Boolean(settings.systemPromptPath) || promptText.length > 0 || prompt.isErr);

  return (
    <div className="space-y-5">
      {settings.model ? (
        <>
          <SettingsSection icon={Cpu} title="Model">
            <dl className="space-y-2 text-xs">
              <SettingRow label="Model" value={settings.model.modelId} mono />
              {settings.model.provider ? (
                <SettingRow label="Provider" value={settings.model.provider} mono />
              ) : null}
            </dl>
          </SettingsSection>

          <Separator className="bg-border/40" />
        </>
      ) : null}

      {settings.toolProviderContext.declared ? (
        <>
          <ToolProviderContextSection settings={settings} contextForm={contextForm} />
          <Separator className="bg-border/40" />
        </>
      ) : null}

      <SettingsSection icon={Wrench} title="Tools">
        <dl className="mb-3 space-y-2 text-xs">
          <SettingRow label="Stop When" value={settings.stopWhen} mono />
        </dl>
        {settings.tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools registered for this agent.</p>
        ) : (
          <ul className="space-y-2">
            {settings.tools.map((tool) => (
              <li key={tool.name} className="rounded-lg border border-border/40 bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {tool.name}
                  </Badge>
                </div>
                {tool.description ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {episodeToolContext ? (
        <>
          <Separator className="bg-border/40" />
          <EpisodeToolContextSection episodeToolContext={episodeToolContext} />
        </>
      ) : null}

      <Separator className="bg-border/40" />

      <SettingsSection icon={Database} title="Memory">
        <dl className="space-y-2 text-xs">
          <SettingRow label="Mode" value={settings.memoryMode} mono />
          {conversation ? <SettingRow label="Scope" value={conversation.runId} mono /> : null}
        </dl>
      </SettingsSection>

      {settings.titleWorkflowId ? (
        <>
          <Separator className="bg-border/40" />
          <SettingsSection icon={GitBranch} title="Title Workflow">
            <p className="font-mono text-[11px] break-all">{settings.titleWorkflowId}</p>
          </SettingsSection>
        </>
      ) : null}

      {showPromptSection ? (
        <>
          <Separator className="bg-border/40" />
          <SettingsSection icon={FileText} title="System Prompt">
            {settings.systemPromptPath ? (
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                {settings.systemPromptPath}
              </p>
            ) : null}
            {prompt.isErr ? (
              <ErrorDetails error={prompt.error} compact />
            ) : promptText ? (
              <div className="rounded-lg border border-border/40 bg-card px-3 py-2">
                <MarkdownContent content={promptText} compact tone="muted" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No system prompt.</p>
            )}
          </SettingsSection>
        </>
      ) : null}

      {settings.outputSchema ? (
        <>
          <Separator className="bg-border/40" />
          <SettingsSection icon={Braces} title="Structured Output">
            <p className="font-mono text-[11px] break-all">{settings.outputSchema}</p>
          </SettingsSection>
        </>
      ) : null}

      {fork && sourceScopeLabel ? (
        <>
          <Separator className="bg-border/40" />
          <dl className="text-xs">
            <SettingRow
              label="Forked From"
              value={
                <Link
                  to="/agent/$agentId/run/$runId"
                  params={{
                    agentId: fork.agentId,
                    runId: fork.sourceMemoryScope,
                  }}
                  className="group max-w-full min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <InspectorNoun
                    icon={MessageSquare}
                    noun="Conversation"
                    title={fork.sourceMemoryScope}
                  >
                    {sourceScopeLabel}
                  </InspectorNoun>
                </Link>
              }
            />
          </dl>
        </>
      ) : null}

      {workflowLink ? (
        <>
          <Separator className="bg-border/40" />
          <dl className="text-xs">
            <SettingRow
              label="Workflow"
              value={
                <Link
                  to="/workflows/$workflowId/run/$runId"
                  params={{
                    workflowId: workflowLink.workflowId,
                    runId: workflowLink.workflowRunId,
                  }}
                  search={{
                    ...(workflowLink.stepId ? { step: workflowLink.stepId } : {}),
                    episode: workflowLink.episodeId,
                  }}
                  className="group max-w-full min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <InspectorNoun
                    icon={GitBranch}
                    noun="Workflow"
                    title={workflowLink.workflowRunId}
                  >
                    {workflowLink.workflowId}
                  </InspectorNoun>
                </Link>
              }
            />
          </dl>
        </>
      ) : null}
    </div>
  );
}

function contextFormPreview(
  form: ToolProviderContextFormState,
  fields: AgentInspectorMeta["toolProviderContext"]["fields"],
): { value: string; error: string | null } {
  try {
    const built = buildToolProviderContextInput({
      declared: true,
      fields,
      values: form.values,
      rawJson: form.rawJson,
      source: form.source,
    });
    return {
      value: built === undefined ? "" : JSON.stringify(built, null, 2),
      error: null,
    };
  } catch (caught) {
    return {
      value: form.rawJson,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

function contextPayloadKey(
  form: ToolProviderContextFormState,
  fields: AgentInspectorMeta["toolProviderContext"]["fields"],
): string | null {
  try {
    const built = buildToolProviderContextInput({
      declared: true,
      fields,
      values: form.values,
      rawJson: form.rawJson,
      source: form.source,
    });
    return JSON.stringify(built === undefined ? null : built);
  } catch {
    return null;
  }
}

function ToolProviderContextSection({
  settings,
  contextForm,
}: {
  settings: AgentInspectorMeta;
  contextForm?: ToolProviderContextFormState;
}) {
  const formId = useId();
  const meta = settings.toolProviderContext;
  const fields = meta.fields;
  const editable = contextForm !== undefined;
  const purpose = contextForm?.purpose ?? "turn";
  const [open, setOpen] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [switchError, setSwitchError] = useState<string | null>(null);
  const snapshotRef = useRef<{
    values: Record<string, string | boolean>;
    rawJson: string;
    source: ContextEditorSource;
    payloadKey: string | null;
  } | null>(null);
  const contextType = fields.length > 0 ? jsonTypeFromFields(fields) : undefined;
  const source: ContextEditorSource =
    fields.length === 0 ? "json" : (contextForm?.source ?? "form");

  if (purpose === "default" && contextForm && contextForm.onSave === undefined) {
    throw new Error("default tool context form requires onSave");
  }

  function reportFieldError(name: string, error: string | null) {
    setFieldErrors((current) => {
      if (error === null) {
        if (!(name in current)) {
          return current;
        }
        const next = { ...current };
        delete next[name];
        return next;
      }
      if (current[name] === error) {
        return current;
      }
      return { ...current, [name]: error };
    });
  }

  function selectSource(next: ContextEditorSource) {
    if (!contextForm) {
      throw new Error("tool context source changed without a form");
    }
    if (fields.length === 0 || next === contextForm.source) {
      return;
    }
    if (next === "json") {
      try {
        const built = buildWorkflowInput(fields, contextForm.values);
        contextForm.onRawJsonChange(JSON.stringify(built, null, 2));
        setFieldErrors({});
        setSwitchError(null);
        contextForm.onSourceChange("json");
      } catch (caught) {
        setSwitchError(caught instanceof Error ? caught.message : String(caught));
      }
      return;
    }
    if (jsonTextError(contextForm.rawJson, contextType) !== null) {
      return;
    }
    const parsed = parseJsonText(contextForm.rawJson);
    if (parsed.isErr) {
      return;
    }
    setSwitchError(null);
    contextForm.onValuesChange(workflowInputValuesFromSample(fields, parsed.value));
    contextForm.onSourceChange("form");
  }

  function formStateFromCurrent(): {
    values: Record<string, string | boolean>;
    rawJson: string;
    source: ContextEditorSource;
  } {
    if (!contextForm) {
      throw new Error("tool context form is required");
    }
    if (fields.length === 0 || contextForm.source === "form") {
      return {
        values: { ...contextForm.values },
        rawJson: contextForm.rawJson,
        source: fields.length === 0 ? "json" : "form",
      };
    }
    if (jsonTextError(contextForm.rawJson, contextType) !== null) {
      return {
        values: { ...contextForm.values },
        rawJson: contextForm.rawJson,
        source: "json",
      };
    }
    const parsed = parseJsonText(contextForm.rawJson);
    if (parsed.isErr) {
      return {
        values: { ...contextForm.values },
        rawJson: contextForm.rawJson,
        source: "json",
      };
    }
    return {
      values: workflowInputValuesFromSample(fields, parsed.value),
      rawJson: contextForm.rawJson,
      source: "form",
    };
  }

  function openEditor() {
    if (!contextForm) {
      throw new Error("tool context editor opened without a form");
    }
    const opened = formStateFromCurrent();
    contextForm.onValuesChange(opened.values);
    contextForm.onRawJsonChange(opened.rawJson);
    contextForm.onSourceChange(opened.source);
    snapshotRef.current = {
      ...opened,
      payloadKey: contextPayloadKey({ ...contextForm, ...opened }, fields),
    };
    setEditorEpoch((epoch) => epoch + 1);
    setOpen(true);
  }

  function closeEditor() {
    const snapshot = snapshotRef.current;
    if (snapshot && contextForm) {
      contextForm.onValuesChange(snapshot.values);
      contextForm.onRawJsonChange(snapshot.rawJson);
      contextForm.onSourceChange(snapshot.source);
    }
    snapshotRef.current = null;
    setOpen(false);
  }

  async function saveEditor() {
    if (!contextForm) {
      throw new Error("tool context save requested without a form");
    }
    if (jsonError !== null || !contextDirty) {
      return;
    }
    if (contextForm.onSave) {
      const saved = await contextForm.onSave();
      if (!saved) {
        return;
      }
    }
    const opened = formStateFromCurrent();
    contextForm.onValuesChange(opened.values);
    contextForm.onRawJsonChange(opened.rawJson);
    contextForm.onSourceChange(opened.source);
    snapshotRef.current = null;
    setOpen(false);
  }

  const preview = contextForm ? contextFormPreview(contextForm, fields) : null;
  const jsonError = contextForm
    ? (toolProviderContextJsonError({
        fields,
        values: contextForm.values,
        rawJson: contextForm.rawJson,
        source,
      }) ??
      Object.values(fieldErrors)[0] ??
      switchError)
    : null;
  const contextDirty =
    snapshotRef.current !== null &&
    contextForm !== undefined &&
    contextPayloadKey(contextForm, fields) !== snapshotRef.current.payloadKey;
  const jsonPresentation = "inline";
  const sourceToggle =
    editable && fields.length > 0 ? (
      <div className="shrink-0">
        <ModeToggle
          mode={source === "form" ? "document" : "json"}
          documentDisabled={
            source === "json" && jsonTextError(contextForm.rawJson, contextType) !== null
          }
          onChange={(mode) => selectSource(mode === "document" ? "form" : "json")}
        />
      </div>
    ) : null;

  const formFields =
    editable && fields.length > 0 && source === "form" ? (
      <div className="grid gap-6">
        {fields.map((field, index) => (
          <SchemaFieldControl
            key={field.name}
            idPrefix={formId}
            field={field}
            autoFocus={index === 0}
            jsonPresentation={jsonPresentation}
            value={contextForm.values[field.name]}
            onChange={(value) =>
              contextForm.onValuesChange({ ...contextForm.values, [field.name]: value })
            }
            onJsonValidityChange={(error) => reportFieldError(field.name, error)}
          />
        ))}
      </div>
    ) : null;

  const rawJsonField =
    editable && (fields.length === 0 || source === "json") ? (
      <div className="flex min-h-0 flex-1 flex-col">
        {fields.length === 0 ? (
          <JsonTextEditor
            id={`${formId}-json`}
            title="JSON"
            presentation={jsonPresentation}
            fill
            value={contextForm.rawJson}
            onChange={contextForm.onRawJsonChange}
          />
        ) : (
          <JsonSchemaRawEditor
            id={`${formId}-json`}
            fill
            jsonType={contextType}
            value={contextForm.rawJson}
            onChange={contextForm.onRawJsonChange}
          />
        )}
      </div>
    ) : null;

  return (
    <SettingsSection
      icon={SlidersHorizontal}
      title={purpose === "default" ? "Default tool context" : "Tool context"}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {purpose === "default" ? (
          <>
            Inspector-only default for new conversations. The runtime does not parse it, and{" "}
            <span className="font-mono">adl agent run</span> ignores it.
          </>
        ) : (
          <>
            Passed to this agent's ToolProvider as{" "}
            <span className="font-mono">toolProviderContext</span>. The runtime does not parse it.
            Leave optional fields blank to omit them.
          </>
        )}
      </p>
      {editable && preview && contextForm ? (
        <>
          <JsonEditorSummary
            id={`${formId}-preview`}
            value={preview.value}
            expanded={open}
            onEdit={openEditor}
          />
          {preview.error ? (
            <p role="alert" className="mt-1.5 text-[10px] text-destructive">
              {preview.error}
            </p>
          ) : null}
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (next) {
                openEditor();
                return;
              }
              closeEditor();
            }}
          >
            <DialogContent className="flex h-[min(85vh,48rem)] min-h-0 w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden sm:max-w-4xl">
              <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
                <DialogTitle className="truncate font-mono text-base">
                  {purpose === "default" ? "Default tool context" : "Tool context"}
                </DialogTitle>
                <DialogDescription>
                  {purpose === "default"
                    ? "Inspector-only default for new conversations. Invalid JSON is not saved."
                    : "Passed on the next send as toolProviderContext. Invalid JSON is not saved."}
                </DialogDescription>
              </DialogHeader>
              <div
                key={editorEpoch}
                className={
                  fields.length === 0 || source === "json"
                    ? "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
                    : "flex min-h-0 flex-1 flex-col gap-4 overflow-auto"
                }
              >
                {sourceToggle}
                {formFields}
                {rawJsonField}
              </div>
              {jsonError ? (
                <p role="alert" className="shrink-0 text-xs text-destructive">
                  {jsonError}
                </p>
              ) : null}
              {contextForm.saveError ? (
                <ErrorDetails error={contextForm.saveError} compact />
              ) : null}
              <DialogFooter className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={contextForm.saving}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={contextForm.saving || jsonError !== null || !contextDirty}
                  onClick={() => void saveEditor()}
                >
                  {contextForm.saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {!editable && fields.length > 0 ? (
        <ul className="space-y-1.5">
          {fields.map((field) => (
            <li key={field.name} className="font-mono text-[11px]">
              {field.name}: {field.kind}
              {field.default !== undefined ? (
                <span className="text-muted-foreground">
                  {" "}
                  (default {JSON.stringify(field.default)})
                </span>
              ) : field.required ? null : (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {!editable && fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No object <span className="font-mono">contextSchema</span>. Pass JSON from the
          conversation form or <span className="font-mono">adl agent run --tool-context</span>.
        </p>
      ) : null}
    </SettingsSection>
  );
}

function EpisodeToolContextSection({
  episodeToolContext,
}: {
  episodeToolContext: EpisodeToolProviderContextView;
}) {
  return (
    <SettingsSection icon={SlidersHorizontal} title="Episode tool context">
      <p className="mb-3 text-xs text-muted-foreground">
        Immutable snapshot recorded on this episode&apos;s{" "}
        <span className="font-mono">agent_started</span>. Editing never rewrites past runs.
      </p>
      {episodeToolContext.value === null ? (
        <p className="text-xs text-muted-foreground">Not recorded.</p>
      ) : (
        <JsonPreview
          title="Episode tool context"
          value={episodeToolContext.value}
          className="bg-card/80"
        />
      )}
      {episodeToolContext.onCopyToNextTurn && episodeToolContext.value !== null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={episodeToolContext.onCopyToNextTurn}
        >
          Copy to next turn
        </Button>
      ) : null}
    </SettingsSection>
  );
}
