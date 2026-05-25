import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
  },
};

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Compact typography for narrow inspector panels */
  compact?: boolean;
  /** Light text on dark bubble (user messages) */
  inverted?: boolean;
}

export function MarkdownContent({
  content,
  className,
  compact = false,
  inverted = false,
}: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "prose max-w-none",
        compact ? "prose-xs" : "prose-sm",
        inverted && "prose-invert",
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
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border/40 bg-muted/40 p-3 text-xs leading-relaxed">
              {children}
            </pre>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <code className={cn("font-mono", codeClassName)} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.9em]" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
