import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Plus } from "lucide-react";
import { mockAgents, mockProject } from "@/lib/mock/data";
import {
  createStandaloneConversation,
  listAgentConversations,
} from "@/lib/mock/agent-conversations";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function AgentConversationsSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeConversationId = pathname.match(/^\/agents\/([^/]+)/)?.[1];
  const conversations = listAgentConversations();

  function handleNewConversation() {
    const agentId = mockAgents[0]?.id ?? "researcher";
    const created = createStandaloneConversation(agentId);
    void navigate({
      to: "/agents/$conversationId",
      params: { conversationId: created.conversationId },
    });
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <MessageSquare className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{mockProject.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {devModeLabel[mockProject.devMode]}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Conversations</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="New agent conversation (mock)"
              onClick={handleNewConversation}
            >
              <Plus className="size-3.5" />
              <span className="sr-only">New conversation</span>
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No conversations yet. Fork from a workflow step or start a new chat.
                </p>
              ) : (
                conversations.map((conv) => (
                  <SidebarMenuItem key={conv.conversationId}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeConversationId === conv.conversationId}
                      tooltip={conv.title}
                    >
                      <Link
                        to="/agents/$conversationId"
                        params={{ conversationId: conv.conversationId }}
                      >
                        <MessageSquare className="size-4 shrink-0" />
                        <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                          <span className="truncate text-xs font-medium">{conv.title}</span>
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {conv.agentId}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground/80">
                            {conv.preview}
                          </span>
                        </div>
                        {conv.conversationId.startsWith("fork_") ? (
                          <GitBranch className="size-3 shrink-0 text-muted-foreground" />
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
