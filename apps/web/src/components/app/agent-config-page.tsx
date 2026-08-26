import { AgentConfigBody, agentSettingsFromMeta } from "@/components/app/agent-settings-panel";
import { ConfigWorkspace } from "@/components/app/config-workspace";
import { NewConversationButton } from "@/components/app/new-conversation-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

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
          New conversation
        </NewConversationButton>
      }
    >
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base">Agent settings</CardTitle>
          <CardDescription>Configuration for this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentConfigBody settings={agentSettingsFromMeta(agent)} />
        </CardContent>
      </Card>
    </ConfigWorkspace>
  );
}
