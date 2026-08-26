import { useAppLoaderData } from "@/hooks/use-app-loader-data";

/** Overlay when project hot-reload failed and the previous registry is still in use. */
export function ProjectReloadErrorBanner() {
  const { project } = useAppLoaderData();
  if (!project.lastReloadError) {
    return null;
  }

  return (
    <div
      role="status"
      className="absolute inset-x-0 top-0 z-30 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5"
    >
      <p className="truncate text-xs text-destructive" title={project.lastReloadError}>
        <span className="font-medium">Hot reload failed</span>
        <span className="text-destructive/80"> — using the previous registry. </span>
        {project.lastReloadError}
      </p>
    </div>
  );
}
