import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { highlightJson, JSON_TOKEN_CLASS } from "@/lib/highlight-json";
import { cn } from "@/lib/utils";

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const JsonTokens = memo(function JsonTokens({ text }: { text: string }) {
  const tokens = useMemo(() => highlightJson(text), [text]);

  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={JSON_TOKEN_CLASS[token.type] || undefined}>
          {token.value}
        </span>
      ))}
    </>
  );
});

export const JsonPreview = memo(function JsonPreview({
  value,
  className,
  empty,
  label,
  title,
  expandable = true,
  children,
}: {
  value: unknown;
  className?: string;
  empty?: string;
  /** Visible section heading; also used as the expand dialog title. */
  label?: string;
  /** Expand dialog title when `label` is omitted. */
  title?: string;
  expandable?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => (value === undefined ? null : stringifyJson(value)), [value]);
  const dialogTitle = title ?? label ?? "JSON";

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const canExpand = expandable && text !== null;

  async function copyJson() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const preview =
    text === null ? (
      empty ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : null
    ) : (
      <div className="relative">
        <pre
          className={cn(
            "overflow-auto rounded-md border border-border/40 bg-card p-2 font-mono text-[10px] leading-relaxed",
            canExpand && !label && "pr-8",
            className,
          )}
        >
          <JsonTokens text={text} />
        </pre>
        {canExpand && !label ? (
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute top-1.5 right-1.5 shadow-sm"
            aria-label={`Expand ${dialogTitle}`}
            onClick={() => setOpen(true)}
          >
            <Maximize2 />
          </Button>
        ) : null}
      </div>
    );

  const dialog =
    canExpand && text !== null ? (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(85vh,48rem)] w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-4xl">
          <DialogHeader className="flex-row items-start justify-between gap-3 pr-8 text-left">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate font-mono text-base">{dialogTitle}</DialogTitle>
              <DialogDescription>Full JSON value for closer review.</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyJson()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </DialogHeader>
          <pre className="min-h-0 max-h-[min(70vh,40rem)] flex-1 overflow-auto rounded-md border border-border/40 bg-card p-4 font-mono text-xs leading-relaxed">
            <JsonTokens text={text} />
          </pre>
        </DialogContent>
      </Dialog>
    ) : null;

  if (!label && !children) {
    return (
      <>
        {preview}
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setOpen(true)}
            >
              <Maximize2 />
              Expand
            </Button>
          ) : null}
        </div>
      ) : null}
      {children}
      {preview}
      {dialog}
    </div>
  );
});
