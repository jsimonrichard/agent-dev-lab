import { Badge } from "@/components/ui/badge";

/** Provenance / caller tags pinned to the bottom of a run inspector. */
export function RunTagsFooter({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-border/40 bg-muted/10 px-3 py-2">
      <p className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Tags
      </p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
