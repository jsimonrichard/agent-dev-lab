import { Braces, Cpu, Database, FileText, GitBranch, MessageSquare, Wrench } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { AgentInspectorMeta } from "#/lib/inspector-types";
import type { ResolvedAgentConversation } from "@/lib/mock/types";
import { Badge } from "@/components/ui/badge";
import { ErrorDetails } from "@/components/app/error-details";
import { InspectorNoun } from "@/components/app/inspector-noun";
import { MarkdownContent } from "@/components/app/markdown-content";
import { SettingRow, SettingsSection } from "@/components/app/inspector-settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatMemoryScopeLabel } from "@/lib/memory-scope-label";

interface AgentSettingsPanelProps {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
}

export function AgentSettingsPanel({ settings, conversation }: AgentSettingsPanelProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Agent settings</h2>
        <p className="text-xs text-muted-foreground">Configuration for this agent</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <AgentConfigBody settings={settings} conversation={conversation} />
        </div>
      </ScrollArea>
    </div>
  );
}

export function AgentConfigBody({
  settings,
  conversation,
}: {
  settings: AgentInspectorMeta;
  conversation?: ResolvedAgentConversation;
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
          <SettingRow label="End when" value={settings.endWhen} mono />
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
          <SettingsSection icon={GitBranch} title="Title workflow">
            <p className="font-mono text-[11px] break-all">{settings.titleWorkflowId}</p>
          </SettingsSection>
        </>
      ) : null}

      {showPromptSection ? (
        <>
          <Separator className="bg-border/40" />
          <SettingsSection icon={FileText} title="System prompt">
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
              label="Forked from"
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
