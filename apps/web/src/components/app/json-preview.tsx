import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Maximize2 } from "lucide-react";

import { CopyTextButton } from "@/components/app/copy-text-button";
import { JsonDocument } from "@/components/app/json-document";
import { JsonTokens } from "@/components/app/json-tokens";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { valueToClipboardText } from "@/lib/json-document";
import { cn } from "@/lib/utils";

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type PreviewMode = "document" | "json";

export const JsonPreview = memo(function JsonPreview({
  value,
  className,
  empty,
  label,
  title,
  expandable = true,
  fill = false,
  scroll = true,
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
  /** Stretch the preview to fill a flex parent instead of using a max-height. */
  fill?: boolean;
  /**
   * Scroll the preview body inside the frame. Set false to grow with content
   * (chat bubbles) instead of creating an inner scrollport.
   */
  scroll?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("document");
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
      <div
        className={cn(
          "flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-border/40 bg-card",
          fill && "h-full min-h-0 flex-1",
          className,
        )}
      >
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1 border-b border-border/40 px-1.5 py-0.5">
          <ModeToggle mode={mode} onChange={setMode} />
          <div className="flex items-center">
            <CopyTextButton
              text={mode === "json" ? text : valueToClipboardText(value)}
              label={mode === "json" ? "JSON" : "value"}
            />
            {canExpand ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                aria-label={`Expand ${dialogTitle}`}
                onClick={() => setOpen(true)}
              >
                <Maximize2 />
                {label ? "Expand" : null}
              </Button>
            ) : null}
          </div>
        </div>
        {mode === "json" ? (
          <pre
            className={cn(
              "min-w-0 max-w-full p-2 font-mono text-[10px] leading-relaxed wrap-anywhere whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              fill || scroll ? "min-h-0 flex-1 overflow-auto" : "overflow-x-hidden",
            )}
          >
            <JsonTokens text={text} />
          </pre>
        ) : (
          <div
            className={cn(
              "min-w-0 max-w-full p-2 text-xs leading-relaxed wrap-anywhere outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              fill || scroll ? "min-h-0 flex-1 overflow-auto" : "overflow-x-hidden",
            )}
          >
            <JsonDocument value={value} compact />
          </div>
        )}
      </div>
    );

  const dialog =
    canExpand && text !== null ? (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(85vh,48rem)] w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-4xl">
          <DialogHeader className="flex-row items-start justify-between gap-3 pr-8 text-left">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate font-mono text-base">{dialogTitle}</DialogTitle>
              <DialogDescription>
                Rendered markdown for string fields, plus raw JSON.
              </DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyJson()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </DialogHeader>
          <Tabs
            value={mode}
            onValueChange={(next) => setMode(next as PreviewMode)}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          >
            <TabsList variant="line" className="w-full shrink-0 justify-start">
              <TabsTrigger value="document" className="flex-none px-3">
                Rendered
              </TabsTrigger>
              <TabsTrigger value="json" className="flex-none px-3">
                JSON
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="document"
              className="min-h-0 flex-1 overflow-auto rounded-md border border-border/40 bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <JsonDocument value={value} />
            </TabsContent>
            <TabsContent
              value="json"
              className="min-h-0 flex-1 overflow-auto rounded-md border border-border/40 bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <pre className="font-mono text-xs leading-relaxed">
                <JsonTokens text={text} />
              </pre>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    ) : null;

  if (!label && !children) {
    return (
      <div className={cn("w-full min-w-0 max-w-full overflow-hidden", fill && "h-full min-h-0")}>
        {preview}
        {dialog}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden",
        fill ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2",
      )}
    >
      {label ? (
        <p className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      {children ? <div className="shrink-0">{children}</div> : null}
      {preview}
      {dialog}
    </div>
  );
});

function ModeToggle({
  mode,
  onChange,
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-md bg-muted/60 p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={mode === "document"}
        className={cn("h-5 px-1.5 text-[10px]", mode === "document" && "bg-background shadow-sm")}
        onClick={() => onChange("document")}
      >
        Rendered
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={mode === "json"}
        className={cn("h-5 px-1.5 text-[10px]", mode === "json" && "bg-background shadow-sm")}
        onClick={() => onChange("json")}
      >
        JSON
      </Button>
    </div>
  );
}
