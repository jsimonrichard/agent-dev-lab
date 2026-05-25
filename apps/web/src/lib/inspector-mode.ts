export type InspectorMode = "home" | "workflows" | "agents" | "settings";

export function inspectorModeFromPath(pathname: string): InspectorMode {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/agent")) return "agents";
  if (pathname.startsWith("/settings")) return "settings";
  return "workflows";
}
