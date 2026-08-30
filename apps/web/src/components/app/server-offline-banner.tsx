import { useInspectorConnection } from "#/lib/inspector-connection";

/** Banner when the serve process has exited (or announced shutdown). */
export function ServerOfflineBanner() {
  const { offline } = useInspectorConnection();
  if (!offline) {
    return null;
  }

  return (
    <div
      role="status"
      className="absolute inset-x-0 top-0 z-40 border-b border-amber-700/40 bg-amber-100 px-4 py-2 dark:border-amber-500/40 dark:bg-amber-950"
    >
      <p className="text-xs text-amber-950 dark:text-amber-100">
        <span className="font-medium">Server exited</span>
        <span className="opacity-80"> — Restart the dashboard to continue.</span>
      </p>
    </div>
  );
}
