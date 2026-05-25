import { Braces, Cpu, Database, FileText, GitBranch, Wrench } from "lucide-react";
import type { MockAgentSettings, ResolvedAgentConversation } from "@/lib/mock/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface AgentSettingsPanelProps {
  settings: MockAgentSettings;
  conversation: ResolvedAgentConversation;
}

export function AgentSettingsPanel({ settings, conversation }: AgentSettingsPanelProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border/40 bg-muted/10">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Agent settings</h2>
        <p className="text-xs text-muted-foreground">
          Configuration for <span className="font-mono text-foreground">{settings.agentId}</span>
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <SettingsSection icon={Cpu} title="Model">
            <dl className="space-y-2 text-xs">
              <SettingRow label="Provider model" value={settings.model} mono />
              <SettingRow label="Temperature" value={String(settings.temperature)} />
              <SettingRow label="Max tool steps" value={String(settings.maxSteps)} />
            </dl>
          </SettingsSection>

          <Separator className="bg-border/40" />

          <SettingsSection icon={Wrench} title="Tools">
            {settings.tools.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tools registered for this agent.</p>
            ) : (
              <ul className="space-y-2">
                {settings.tools.map((tool) => (
                  <li
                    key={tool.name}
                    className="rounded-lg border border-border/40 bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {tool.name}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {tool.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>

          <Separator className="bg-border/40" />

          <SettingsSection icon={Database} title="Memory">
            <dl className="space-y-2 text-xs">
              <SettingRow label="Mode" value={settings.memoryMode} />
              <SettingRow
                label="Scope"
                value={conversation.forkSession?.sourceMemoryScope ?? conversation.runId}
                mono
              />
            </dl>
          </SettingsSection>

          {(settings.outputSchema ?? settings.systemPromptPath) ? (
            <>
              <Separator className="bg-border/40" />
              <SettingsSection icon={Braces} title="Output & prompts">
                <dl className="space-y-2 text-xs">
                  {settings.outputSchema ? (
                    <SettingRow label="Structured output" value={settings.outputSchema} mono />
                  ) : null}
                  {settings.systemPromptPath ? (
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">System prompt</dt>
                        <dd className="font-mono text-[11px] text-foreground">
                          {settings.systemPromptPath}
                        </dd>
                      </div>
                    </div>
                  ) : null}
                </dl>
              </SettingsSection>
            </>
          ) : null}

          {conversation.forkSession ? (
            <>
              <Separator className="bg-border/40" />
              <SettingsSection icon={GitBranch} title="Fork provenance">
                <dl className="space-y-2 text-xs">
                  <SettingRow
                    label="Source run"
                    value={conversation.forkSession.sourceRunId}
                    mono
                  />
                  <SettingRow
                    label="Source episode"
                    value={conversation.forkSession.sourceEpisodeId}
                    mono
                  />
                </dl>
              </SettingsSection>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-muted-foreground sm:w-28">{label}</dt>
      <dd className={mono ? "min-w-0 break-all font-mono text-[11px]" : "min-w-0"}>{value}</dd>
    </div>
  );
}
