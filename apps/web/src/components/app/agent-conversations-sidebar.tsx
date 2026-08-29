import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Bot, MessageSquare, Plus } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { parseAgentLocation } from "@/lib/agent/agent-location";
import { AgentSessionIdentity } from "@/components/app/agent-session-identity";
import { ItemActionsMenu } from "@/components/app/item-actions-menu";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { NewConversationButton } from "@/components/app/new-conversation-button";
import { ContextSidebar } from "@/components/app/context-sidebar";
import { deleteAgentConversation, renameAgentConversation } from "#/lib/inspector/inspector-server";
import { isWorkflowLinkedConversation } from "@/lib/agent/agent-sessions";
import { latestTimestampById, sortByLastUsedThenAlpha } from "@/lib/nav-sort";
import { formatRunTimestamp } from "@/lib/workflow/workflow-location";
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
  const router = useRouter();
  const { project, sessions, runs } = useAppLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { agentId: selectedAgentId, runId: activeRunId } = parseAgentLocation(pathname);
  const selectedSessions = selectedAgentId
    ? sessions.filter((session) => session.agentId === selectedAgentId)
    : [];
  const agentIds = sortByLastUsedThenAlpha(
    project.agentIds,
    latestTimestampById(
      sessions,
      (session) => session.agentId,
      (session) => session.updatedAt,
    ),
  );

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={selectedAgentId ? selectedAgentId : "All agents"}
            >
              <Link
                to={selectedAgentId ? "/agent/$agentId" : "/agent"}
                params={selectedAgentId ? { agentId: selectedAgentId } : undefined}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{selectedAgentId ?? project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedAgentId ? "Agent" : devModeLabel[project.devMode]}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {selectedAgentId ? (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>Conversations</span>
              <NewConversationButton
                variant="ghost"
                size="icon"
                className="size-6"
                title="New conversation"
                agentId={selectedAgentId}
              >
                <Plus className="size-3.5" />
                <span className="sr-only">New conversation</span>
              </NewConversationButton>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {selectedSessions.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    No conversations yet. Start a new chat with the + button.
                  </p>
                ) : (
                  selectedSessions.map((session) => {
                    return (
                      <SidebarMenuItem key={session.memoryScope}>
                        <ItemActionsMenu
                          name={session.title}
                          onRename={async (title) => {
                            const result = await renameAgentConversation({
                              data: { memoryScope: session.memoryScope, title },
                            });
                            if (result.isErr) {
                              throw new Error(result.error);
                            }
                            await router.invalidate();
                          }}
                          onDelete={
                            isWorkflowLinkedConversation(session)
                              ? undefined
                              : async () => {
                                  const result = await deleteAgentConversation({
                                    data: session.memoryScope,
                                  });
                                  if (result.isErr) {
                                    throw new Error(result.error);
                                  }
                                  if (activeRunId === session.memoryScope) {
                                    await navigate({
                                      to: "/agent/$agentId",
                                      params: { agentId: session.agentId },
                                    });
                                  }
                                  await router.invalidate();
                                }
                          }
                        >
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
                                <AgentSessionIdentity
                                  session={session}
                                  runs={runs}
                                  className="font-mono text-[10px] text-muted-foreground"
                                />
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {formatRunTimestamp(session.updatedAt)}
                                  {session.fork ? " · Forked" : ""}
                                </span>
                              </div>
                            </Link>
                          </SidebarMenuButton>
                        </ItemActionsMenu>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {agentIds.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    No agents registered in this project.
                  </p>
                ) : (
                  agentIds.map((id) => {
                    const count = sessions.filter((session) => session.agentId === id).length;
                    return (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton asChild tooltip={id} className="h-auto min-h-10 py-2">
                          <Link to="/agent/$agentId" params={{ agentId: id }}>
                            <Bot className="size-4 shrink-0" />
                            <div className="grid min-w-0 flex-1 text-left">
                              <span className="truncate font-mono text-xs">{id}</span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {count === 0
                                  ? "No conversations yet"
                                  : `${count} conversation${count === 1 ? "" : "s"}`}
                              </span>
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarBackFooter
        label={selectedAgentId ? "All agents" : "Back to overview"}
        to={selectedAgentId ? "/agent" : "/"}
      />
    </ContextSidebar>
  );
}
