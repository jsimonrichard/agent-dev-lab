import { memo } from "react";

import { CopyTextButton } from "@/components/app/copy-text-button";
import { MarkdownContent } from "@/components/app/markdown-content";
import { JsonTokens } from "@/components/app/json-tokens";
import { JSON_TOKEN_CLASS } from "@/lib/highlight-json";
import { isPlainObject, valueToClipboardText } from "@/lib/json-document";
import { cn } from "@/lib/utils";

const MAX_DEPTH = 8;
const MARKDOWN_MAX_CHARS = 100_000;

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const JsonDocument = memo(function JsonDocument({
  value,
  compact = false,
  depth = 0,
}: {
  value: unknown;
  compact?: boolean;
  depth?: number;
}) {
  return <JsonNode value={value} compact={compact} depth={depth} copySelf={depth === 0} />;
});

function JsonNode({
  value,
  compact,
  depth,
  copySelf,
}: {
  value: unknown;
  compact: boolean;
  depth: number;
  copySelf: boolean;
}) {
  if (depth >= MAX_DEPTH) {
    const text = stringifyJson(value);
    return (
      <div className="min-w-0">
        {copySelf ? (
          <div className="mb-1 flex justify-end">
            <CopyTextButton text={text} label="JSON" />
          </div>
        ) : null}
        <pre className="overflow-auto font-mono text-[10px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <JsonTokens text={text} />
        </pre>
      </div>
    );
  }

  if (typeof value === "string") {
    return <ProseString value={value} compact={compact} copyable={copySelf} />;
  }

  if (Array.isArray(value)) {
    return <ArrayFields items={value} compact={compact} depth={depth} copySelf={copySelf} />;
  }

  if (isPlainObject(value)) {
    return <ObjectFields obj={value} compact={compact} depth={depth} copySelf={copySelf} />;
  }

  return <PrimitiveValue value={value} copyable={copySelf} />;
}

function ProseString({
  value,
  compact,
  copyable,
}: {
  value: string;
  compact: boolean;
  copyable: boolean;
}) {
  const truncated = value.length > MARKDOWN_MAX_CHARS;
  const content = truncated ? `${value.slice(0, MARKDOWN_MAX_CHARS)}\n\n…truncated` : value;

  return (
    <div className="relative min-w-0">
      {copyable ? (
        <div className="absolute top-0 right-0 z-10">
          <CopyTextButton text={value} label="markdown" />
        </div>
      ) : null}
      <MarkdownContent
        content={content}
        compact={compact}
        className={copyable ? "pr-7" : undefined}
      />
    </div>
  );
}

function ObjectFields({
  obj,
  compact,
  depth,
  copySelf,
}: {
  obj: Record<string, unknown>;
  compact: boolean;
  depth: number;
  copySelf: boolean;
}) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
        {"{}"}
        {copySelf ? <CopyTextButton text="{}" label="object" /> : null}
      </span>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {entries.map(([key, child]) => (
        <Field key={key} name={key} value={child} compact={compact} depth={depth} />
      ))}
    </div>
  );
}

function ArrayFields({
  items,
  compact,
  depth,
  copySelf,
}: {
  items: unknown[];
  compact: boolean;
  depth: number;
  copySelf: boolean;
}) {
  if (items.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
        []
        {copySelf ? <CopyTextButton text="[]" label="array" /> : null}
      </span>
    );
  }

  return (
    <div className="min-w-0">
      {copySelf ? (
        <div className="mb-1.5 flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">[{items.length}]</span>
          <CopyTextButton text={valueToClipboardText(items)} label="array" className="ml-auto" />
        </div>
      ) : null}
      <ol className="min-w-0 list-none space-y-2.5">
        {items.map((item, index) => (
          <ArrayItem key={index} index={index} value={item} compact={compact} depth={depth} />
        ))}
      </ol>
    </div>
  );
}

function ArrayItem({
  index,
  value,
  compact,
  depth,
}: {
  index: number;
  value: unknown;
  compact: boolean;
  depth: number;
}) {
  const object = isPlainObject(value);
  const array = Array.isArray(value);
  const prose = typeof value === "string";
  const label = `item ${index}`;
  const copyButton = <CopyTextButton text={valueToClipboardText(value)} label={label} />;
  const marker = (
    <span
      className={cn(
        "w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground",
        prose ? "flex h-6 items-center justify-end leading-none" : "pt-0.5 leading-4",
      )}
    >
      {index}.
    </span>
  );
  const count = object ? Object.keys(value).length : array ? value.length : null;

  if (prose) {
    return (
      <li className="flex min-w-0 items-start gap-2">
        {marker}
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <ProseString value={value} compact={compact} copyable={false} />
        </div>
        {copyButton}
      </li>
    );
  }

  if (!object && !array) {
    return (
      <li className="flex min-w-0 items-start gap-2">
        {marker}
        <div className="min-w-0 flex-1">
          <PrimitiveValue value={value} copyable={false} />
        </div>
        {copyButton}
      </li>
    );
  }

  return (
    <li className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-1.5">
        {marker}
        {count != null ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {object ? `{${count}}` : `[${count}]`}
          </span>
        ) : null}
        <span className="ml-auto shrink-0">{copyButton}</span>
      </div>
      <div className="min-w-0 overflow-x-auto overflow-y-hidden pl-7">
        <JsonNode value={value} compact={compact} depth={depth + 1} copySelf={false} />
      </div>
    </li>
  );
}

function Field({
  name,
  value,
  compact,
  depth,
}: {
  name: string;
  value: unknown;
  compact: boolean;
  depth: number;
}) {
  const object = isPlainObject(value);
  const array = Array.isArray(value);
  const block = typeof value === "string" || array || object;
  const copyButton = <CopyTextButton text={valueToClipboardText(value)} label={name} />;
  const count = object ? Object.keys(value).length : array ? value.length : null;

  if (!block) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("min-w-0 truncate font-mono text-xs", JSON_TOKEN_CLASS.key)}>
          {name}
        </span>
        <div className="min-w-0 flex-1">
          <PrimitiveValue value={value} copyable={false} />
        </div>
        {copyButton}
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-1.5">
        <span className={cn("min-w-0 truncate font-mono text-xs", JSON_TOKEN_CLASS.key)}>
          {name}
        </span>
        {count != null ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {object ? `{${count}}` : `[${count}]`}
          </span>
        ) : null}
        <span className="ml-auto shrink-0">{copyButton}</span>
      </p>
      <div className="min-w-0 overflow-x-auto overflow-y-hidden pl-3.5">
        <JsonNode value={value} compact={compact} depth={depth + 1} copySelf={false} />
      </div>
    </section>
  );
}

function PrimitiveValue({
  value,
  copyable,
  label = "value",
}: {
  value: unknown;
  copyable: boolean;
  label?: string;
}) {
  const content = <PrimitiveText value={value} />;
  if (!copyable) return content;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">{content}</div>
      <CopyTextButton text={valueToClipboardText(value)} label={label} />
    </div>
  );
}

function PrimitiveText({ value }: { value: unknown }) {
  if (value === null) {
    return <span className={cn("font-mono text-[10px]", JSON_TOKEN_CLASS.null)}>null</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={cn("font-mono text-[10px]", JSON_TOKEN_CLASS.boolean)}>{String(value)}</span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className={cn("font-mono text-[10px]", JSON_TOKEN_CLASS.number)}>{String(value)}</span>
    );
  }
  if (typeof value === "string") {
    return (
      <span className={cn("min-w-0 wrap-anywhere font-mono text-[10px]", JSON_TOKEN_CLASS.string)}>
        {value}
      </span>
    );
  }
  if (value === undefined) {
    return <span className="font-mono text-[10px] text-muted-foreground">undefined</span>;
  }
  return (
    <span className="min-w-0 wrap-anywhere font-mono text-[10px] text-muted-foreground">
      {String(value)}
    </span>
  );
}
