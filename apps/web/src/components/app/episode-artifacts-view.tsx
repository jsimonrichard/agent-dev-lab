import type { EpisodeArtifacts } from "@/lib/mock/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Braces, Wrench } from "lucide-react";

interface EpisodeArtifactsViewProps {
  artifacts: EpisodeArtifacts | undefined;
  className?: string;
}

export function EpisodeArtifactsView({ artifacts, className }: EpisodeArtifactsViewProps) {
  if (!artifacts) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No tool or structured output for this episode.
      </p>
    );
  }

  const hasTools = artifacts.toolCalls.length > 0 || artifacts.toolResults.length > 0;
  const hasStructured = artifacts.structuredOutput != null;

  if (!hasTools && !hasStructured) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">No artifacts recorded.</p>
    );
  }

  return (
    <ScrollArea className={cn("flex-1", className)}>
      <div className="space-y-4 p-3">
        {hasStructured && artifacts.structuredOutput ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Braces className="size-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold">Structured output</h3>
              <Badge variant="secondary" className="h-5 text-[10px]">
                {artifacts.structuredOutput.schemaName}
              </Badge>
            </div>
            <pre className="max-h-48 overflow-auto rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(artifacts.structuredOutput.value, null, 2)}
            </pre>
          </section>
        ) : null}

        {hasTools ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Wrench className="size-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold">Tool calls & results</h3>
            </div>
            <ul className="space-y-3">
              {artifacts.toolCalls.map((call) => {
                const result = artifacts.toolResults.find((r) => r.toolCallId === call.id);
                return (
                  <li
                    key={call.id}
                    className="overflow-hidden rounded-lg border border-border/40 bg-card"
                  >
                    <div className="border-b border-border/40 bg-muted/25 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          call
                        </Badge>
                        <span className="font-mono text-xs font-medium">{call.name}</span>
                      </div>
                      <pre className="mt-2 max-h-24 overflow-auto font-mono text-[10px] text-muted-foreground">
                        {JSON.stringify(call.args, null, 2)}
                      </pre>
                    </div>
                    {result ? (
                      <div className="px-3 py-2">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge
                            variant={result.isError ? "destructive" : "secondary"}
                            className="font-mono text-[10px]"
                          >
                            result
                          </Badge>
                        </div>
                        <pre
                          className={cn(
                            "max-h-32 overflow-auto font-mono text-[10px] leading-relaxed",
                            result.isError && "text-destructive",
                          )}
                        >
                          {JSON.stringify(result.result, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="px-3 py-2 text-[10px] text-muted-foreground">
                        Awaiting result…
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}
