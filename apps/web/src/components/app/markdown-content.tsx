import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { JsonTokens } from "@/components/app/json-preview";
import { cn } from "@/lib/utils";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
  },
};

type MarkdownTone = "default" | "on-primary" | "muted";

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Compact typography for narrow inspector panels */
  compact?: boolean;
  /**
   * Text colors for the surrounding bubble/surface.
   * `on-primary` follows `text-primary-foreground` (do not use prose-invert — it breaks on light primary bubbles in dark mode).
   */
  tone?: MarkdownTone;
}

const toneClasses: Record<MarkdownTone, string> = {
  default:
    "text-card-foreground prose-headings:text-card-foreground prose-p:text-card-foreground prose-li:text-card-foreground prose-strong:text-card-foreground prose-a:text-primary",
  "on-primary":
    "text-primary-foreground prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground prose-strong:text-primary-foreground prose-a:text-primary-foreground prose-code:text-primary-foreground prose-code:bg-primary-foreground/15 prose-th:text-primary-foreground prose-td:text-primary-foreground",
  muted:
    "text-muted-foreground prose-headings:text-muted-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-muted-foreground prose-a:text-muted-foreground",
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
  compact = false,
  tone = "default",
}: MarkdownContentProps) {
  const components = useMemo(() => markdownComponents(tone), [tone]);

  return (
    <div
      className={cn(
        "prose max-w-none",
        compact ? "prose-xs" : "prose-sm",
        toneClasses[tone],
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:my-1.5 prose-p:leading-relaxed",
        "prose-ul:my-1.5 prose-ol:my-1.5",
        "prose-li:my-0",
        "prose-pre:my-2 prose-pre:bg-transparent prose-pre:p-0",
        "prose-code:before:content-none prose-code:after:content-none",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

function markdownComponents(tone: MarkdownTone) {
  return {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
      >
        {children}
      </a>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
      <pre
        className={cn(
          "my-2 overflow-x-auto rounded-md border p-3 text-xs leading-relaxed",
          tone === "on-primary"
            ? "border-primary-foreground/25 bg-primary-foreground/10"
            : "border-border/40 bg-muted/40",
        )}
      >
        {children}
      </pre>
    ),
    code: ({
      className: codeClassName,
      children,
      ...props
    }: {
      className?: string;
      children?: ReactNode;
    }) => {
      const isBlock = codeClassName?.includes("language-");
      if (isBlock) {
        const isJson = /\blanguage-json\b/.test(codeClassName ?? "");
        const text = String(children).replace(/\n$/, "");
        return (
          <code className={cn("font-mono", codeClassName)} {...props}>
            {isJson ? <JsonTokens text={text} /> : children}
          </code>
        );
      }
      return (
        <code
          className={cn(
            "rounded px-1 py-0.5 font-mono text-[0.9em]",
            tone === "on-primary" ? "bg-primary-foreground/15" : "bg-muted/60",
          )}
          {...props}
        >
          {children}
        </code>
      );
    },
  };
}
