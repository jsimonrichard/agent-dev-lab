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
import { useId } from "react";

import type { AgentInspectorMeta } from "#/lib/inspector/inspector-types";
import type { ResolvedAgentConversation } from "@/lib/view-model/types";
import { RunTagsFooter } from "@/components/app/run-tags-footer";
import { Badge } from "@/components/ui/badge";
import { ErrorDetails } from "@/components/app/error-details";
import { InspectorNoun } from "@/components/app/inspector-noun";
import { SettingRow, SettingsSection } from "@/components/app/inspector-settings";
import { MarkdownContent } from "@/components/app/markdown-content";
import { SchemaFieldControl } from "@/components/app/schema-field-control";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";

export interface ToolProviderContextFormState {
  values: Record<string, string | boolean>;
  rawJson: string;
  onValuesChange: (values: Record<string, string | boolean>) => void;
  onRawJsonChange: (rawJson: string) => void;
}

interface AgentSettingsPanelProps {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
  contextForm?: ToolProviderContextFormState;
}

export function AgentSettingsPanel({
  settings,
  conversation,
  contextForm,
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
}: {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
  contextForm?: ToolProviderContextFormState;
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

      {settings.toolProviderContext.declared ? (
        <>
          <Separator className="bg-border/40" />
          <ToolProviderContextSection settings={settings} contextForm={contextForm} />
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

  return (
    <SettingsSection icon={SlidersHorizontal} title="Tool context">
      <p className="mb-3 text-xs text-muted-foreground">
        Passed to this agent's ToolProvider as{" "}
        <span className="font-mono">toolProviderContext</span>. The runtime does not parse it. Leave
        optional fields blank to omit them.
      </p>
      {editable && fields.length > 0 ? (
        <div className="grid gap-3">
          {fields.map((field) => (
            <SchemaFieldControl
              key={field.name}
              idPrefix={formId}
              field={field}
              value={contextForm.values[field.name]}
              onChange={(value) =>
                contextForm.onValuesChange({ ...contextForm.values, [field.name]: value })
              }
            />
          ))}
        </div>
      ) : null}
      {editable && fields.length === 0 ? (
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-json`}>JSON</Label>
          <Textarea
            id={`${formId}-json`}
            value={contextForm.rawJson}
            onChange={(event) => contextForm.onRawJsonChange(event.target.value)}
            className="min-h-20 font-mono text-xs"
            spellCheck={false}
            placeholder='{"projectPath":"/path/to/crate"}'
          />
        </div>
      ) : null}
      {!editable && fields.length > 0 ? (
        <ul className="space-y-1.5">
          {fields.map((field) => (
            <li key={field.name} className="font-mono text-[11px] text-muted-foreground">
              {field.name}: {field.kind}
              {field.required ? "" : " (optional)"}
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
