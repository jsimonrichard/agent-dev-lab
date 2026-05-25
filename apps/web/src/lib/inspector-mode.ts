export type InspectorMode = "workflows" | "agents" | "settings";

export function inspectorModeFromPath(pathname: string): InspectorMode {
  if (pathname.startsWith("/agents")) return "agents";
  if (pathname.startsWith("/settings")) return "settings";
  return "workflows";
}
