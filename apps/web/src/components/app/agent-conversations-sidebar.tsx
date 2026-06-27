import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, MessageSquare, Plus } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { parseAgentPath } from "@/lib/inspector-path";
import { createAgentSession } from "#/lib/inspector-server";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { Button } from "@/components/ui/button";
import { ContextSidebar } from "@/components/app/context-sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function AgentConversationsSidebar() {
  const { project, sessions } = useAppLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { agentId: activeAgentId, runId: activeRunId } = parseAgentPath(pathname);
  const onRegistry = pathname === "/agent";

  async function handleNewConversation(agentId: string) {
    const { memoryScope } = await createAgentSession({ data: agentId });
    window.location.href = `/agent/${agentId}/r/${memoryScope}`;
  }

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild isActive={onRegistry}>
              <Link to="/agent">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <MessageSquare className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Agents</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {project.agentIds.length} registered
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{project.name}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {project.agentIds.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No agents in <code className="text-[10px]">adl.config.ts</code>.
                </p>
              ) : (
                project.agentIds.map((id) => {
                  const agentSessions = sessions.filter((session) => session.agentId === id);
                  const isActiveAgent = activeAgentId === id;
                  const open = isActiveAgent || agentSessions.length > 0;

                  return (
                    <Collapsible key={id} defaultOpen={open} className="group/collapsible">
                      <SidebarMenuItem>
                        <div className="flex items-center gap-0.5">
                          <SidebarMenuButton
                            asChild
                            isActive={isActiveAgent && !activeRunId}
                            tooltip={id}
                            className="min-w-0 flex-1"
                          >
                            <Link to="/agent/$agentId" params={{ agentId: id }}>
                              <MessageSquare className="size-4 shrink-0" />
                              <span className="truncate font-mono text-xs">{id}</span>
                            </Link>
                          </SidebarMenuButton>
                          <CollapsibleTrigger className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent">
                            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                            <span className="sr-only">Toggle conversations</span>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <div className="flex items-center justify-between px-2 py-1">
                                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                  Chats
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-5"
                                  title={`New ${id} chat`}
                                  onClick={() => void handleNewConversation(id)}
                                >
                                  <Plus className="size-3" />
                                  <span className="sr-only">New chat</span>
                                </Button>
                              </div>
                            </SidebarMenuSubItem>
                            {agentSessions.length === 0 ? (
                              <SidebarMenuSubItem>
                                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                  No conversations yet.
                                </p>
                              </SidebarMenuSubItem>
                            ) : (
                              agentSessions.map((session) => (
                                <SidebarMenuSubItem key={session.memoryScope}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={activeRunId === session.memoryScope}
                                    className="h-auto min-h-8 py-1.5"
                                  >
                                    <Link
                                      to="/agent/$agentId/r/$runId"
                                      params={{ agentId: id, runId: session.memoryScope }}
                                    >
                                      <span className="line-clamp-2 text-[11px] leading-snug">
                                        {session.title}
                                      </span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarBackFooter />
    </ContextSidebar>
  );
}
