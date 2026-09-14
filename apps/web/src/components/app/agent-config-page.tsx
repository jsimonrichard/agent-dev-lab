import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import type { AgentInspectorMeta } from "#/lib/inspector/inspector-types";
import {
  buildToolProviderContextInput,
  seedToolProviderContextForm,
} from "#/lib/agent/agent-tools";
import { saveAgentToolContextDefault } from "#/lib/inspector/inspector-server";
import { AgentConfigBody } from "@/components/app/agent-settings-panel";
import { ConfigWorkspace } from "@/components/app/config-workspace";
import { ErrorDetails } from "@/components/app/error-details";
import { NewConversationButton } from "@/components/app/new-conversation-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

function seedFormFromDefault(settings: AgentInspectorMeta): {
  values: Record<string, string | boolean>;
  rawJson: string;
} {
  return seedToolProviderContextForm({
    fields: settings.toolProviderContext.fields,
    sample: settings.toolProviderContext.sample,
    seed: settings.defaultToolProviderContext,
  });
}

export function AgentRegistryPage() {
  return <ConfigWorkspace title="Agents" emptyMessage="No agent selected" />;
}

export function AgentDefinitionPage({ agentId }: { agentId: string }) {
  const { project } = useAppLoaderData();
  const agent = project.agents.find((item) => item.id === agentId);

  if (!agent) {
    return null;
  }

  return (
    <ConfigWorkspace
      title={<span className="font-mono">{agent.id}</span>}
      subtitle="No conversation selected. Start a chat or pick one from the sidebar."
      actions={
        <NewConversationButton size="sm" agentId={agent.id}>
          New Conversation
        </NewConversationButton>
      }
    >
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base">Agent Settings</CardTitle>
          <CardDescription>Configuration for this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentDefinitionSettings key={`${agent.id}:${project.generation}`} settings={agent} />
        </CardContent>
      </Card>
    </ConfigWorkspace>
  );
}

function AgentDefinitionSettings({ settings }: { settings: AgentInspectorMeta }) {
  const router = useRouter();
  const seeded = useMemo(() => seedFormFromDefault(settings), [settings]);
  const [values, setValues] = useState(seeded.values);
  const [rawJson, setRawJson] = useState(seeded.rawJson);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!settings.toolProviderContext.declared) {
    return <AgentConfigBody settings={settings} />;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      const built = buildToolProviderContextInput({
        declared: true,
        fields: settings.toolProviderContext.fields,
        values,
        rawJson,
      });
      const result = await saveAgentToolContextDefault({
        data: {
          agentId: settings.id,
          ...(built === undefined ? { clear: true } : { toolProviderContext: built }),
        },
      });
      if (result.isErr) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setSavedNotice(true);
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <AgentConfigBody
        settings={settings}
        contextForm={{
          values,
          rawJson,
          onValuesChange: setValues,
          onRawJsonChange: setRawJson,
          purpose: "default",
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save tool context default"}
        </Button>
        {savedNotice ? (
          <p className="text-xs text-muted-foreground">Saved. New conversations seed from this.</p>
        ) : null}
      </div>
      {error ? <ErrorDetails error={error} compact /> : null}
    </div>
  );
}
