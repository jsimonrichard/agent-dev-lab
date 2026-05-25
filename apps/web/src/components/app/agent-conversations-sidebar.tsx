import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Plus } from "lucide-react";
import { mockAgents, mockProject } from "@/lib/mock/data";
import {
  createStandaloneConversation,
  listAgentConversations,
} from "@/lib/mock/agent-conversations";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { Button } from "@/components/ui/button";
import { ContextSidebar } from "@/components/app/context-sidebar";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function AgentConversationsSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeRunId = pathname.match(/^\/agent\/[^/]+\/run\/([^/]+)/)?.[1];
  const conversations = listAgentConversations();

  function handleNewConversation() {
    const agentId = mockAgents[0]?.id ?? "researcher";
    const created = createStandaloneConversation(agentId);
    void navigate({
      to: "/agent/$agentId/run/$runId",
      params: { agentId: created.agentId, runId: created.runId },
    });
  }

  return (
    <ContextSidebar>
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

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-0 py-2">
          <SidebarGroupLabel className="flex items-center justify-between px-2">
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
          <SidebarGroupContent className="px-1">
            <SidebarMenu className="gap-1.5">
              {conversations.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No conversations yet. Fork from a workflow step or start a new chat.
                </p>
              ) : (
                conversations.map((conv) => (
                  <SidebarMenuItem key={conv.runId}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeRunId === conv.runId}
                      tooltip={`${conv.title}\n${conv.preview}`}
                      className="h-auto min-h-14 items-start py-2.5"
                    >
                      <Link
                        to="/agent/$agentId/run/$runId"
                        params={{ agentId: conv.agentId, runId: conv.runId }}
                      >
                        <MessageSquare className="mt-0.5 size-4 shrink-0" />
                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-snug">
                          <span className="line-clamp-2 text-xs font-medium leading-snug">
                            {conv.title}
                          </span>
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {conv.agentId}
                            <span className="font-sans text-muted-foreground/70">
                              {" · "}
                              {conv.preview}
                            </span>
                          </span>
                        </div>
                        {conv.runId.startsWith("fork_") ? (
                          <GitBranch className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
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

      <SidebarBackFooter />
    </ContextSidebar>
  );
}
