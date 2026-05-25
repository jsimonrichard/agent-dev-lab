import { Link, useNavigate, useRouteContext, useRouterState } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Plus } from "lucide-react";

import { createAgentSession } from "#/lib/inspector-server";
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
  const { project, sessions } = useRouteContext({ from: "/_app" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeRunId = pathname.match(/^\/agent\/[^/]+\/run\/([^/]+)/)?.[1];
  const defaultAgentId = project.agentIds[0];

  async function handleNewConversation() {
    if (!defaultAgentId) return;
    const { memoryScope } = await createAgentSession({ data: defaultAgentId });
    void navigate({
      to: "/agent/$agentId/run/$runId",
      params: { agentId: defaultAgentId, runId: memoryScope },
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
                <span className="truncate font-semibold">{project.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {devModeLabel[project.devMode]}
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
              title="New agent conversation"
              disabled={!defaultAgentId}
              onClick={() => void handleNewConversation()}
            >
              <Plus className="size-3.5" />
              <span className="sr-only">New conversation</span>
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-1">
            <SidebarMenu className="gap-1.5">
              {sessions.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No conversations yet. Fork from a workflow step or start a new chat.
                </p>
              ) : (
                sessions.map((session) => (
                  <SidebarMenuItem key={session.memoryScope}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeRunId === session.memoryScope}
                      tooltip={session.title}
                      className="h-auto min-h-14 items-start py-2.5"
                    >
                      <Link
                        to="/agent/$agentId/run/$runId"
                        params={{ agentId: session.agentId, runId: session.memoryScope }}
                      >
                        <MessageSquare className="mt-0.5 size-4 shrink-0" />
                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-snug">
                          <span className="line-clamp-2 text-xs font-medium leading-snug">
                            {session.title}
                          </span>
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {session.agentId}
                          </span>
                        </div>
                        {session.fork ? (
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
