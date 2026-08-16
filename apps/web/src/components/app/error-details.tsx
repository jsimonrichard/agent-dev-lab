import { cn } from "@/lib/utils";
import { formatSerializedError, formatSerializedErrorHeadline } from "@/lib/format-error";
import { JsonPreview } from "@/components/app/json-preview";

/** One-line status cue — not the full error dump. */
export function ErrorIndicator({ error, className }: { error: unknown; className?: string }) {
  const headline = formatSerializedErrorHeadline(error);
  return (
    <p className={cn("truncate text-xs text-destructive", className)} title={headline}>
      {headline}
    </p>
  );
}

export function ErrorDetails({
  error,
  className,
  compact = false,
}: {
  error: unknown;
  className?: string;
  compact?: boolean;
}) {
  const formatted = formatSerializedError(error);

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/10 text-destructive",
        compact ? "p-2" : "p-3",
        className,
      )}
    >
      <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
        {formatted.name || formatted.code ? (
          <span className="mr-1.5 font-mono text-[10px] font-normal tracking-wide uppercase opacity-80">
            {[formatted.name, formatted.code].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {formatted.message}
      </p>
      {formatted.extra ? (
        <JsonPreview
          title="Error details"
          value={formatted.extra}
          className="mt-2 max-h-40 border-destructive/20 bg-background/60 text-foreground"
        />
      ) : null}
      {formatted.stack ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            Stack trace
          </summary>
          <pre className="mt-1.5 max-h-48 overflow-auto font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {formatted.stack}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
