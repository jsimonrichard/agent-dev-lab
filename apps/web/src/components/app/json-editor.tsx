import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { JsonSchemaType } from "#/lib/inspector/inspector-types";
import type { JsonValue } from "#/lib/view-model/types";
import { JsonCodeEditor } from "@/components/app/json-code-editor";
import { JsonDocument } from "@/components/app/json-document";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JSON_TOKEN_CLASS } from "@/lib/highlight-json";
import { MAX_JSON_TREE_DEPTH } from "@/lib/json-document";
import {
  addObjectKey,
  composerNeedsText,
  defaultValueForJsonType,
  editorVariants,
  fieldValueAction,
  isJsonObject,
  jsonTypeLabel,
  jsonTypeToZodText,
  parseJsonText,
  jsonTextError,
  resolveEditorVariant,
  removeAtPath,
  renameObjectKey,
  stringifyJsonValue,
  valueFromComposerDraft,
  valueMatchesJsonType,
  type FieldValueAction,
  type JsonPath,
} from "@/lib/json-editor";
import { cn } from "@/lib/utils";

type EditorMode = "document" | "json";

/** Document-mode inputs/selects: taller than the old h-6 token rows, still under default h-9. */
const EDITOR_CONTROL_CLASS = "h-8 min-w-0 px-2 font-mono text-xs shadow-none";

type NestedValidityReporter = (id: string, error: string | null) => void;

const NestedJsonValidityContext = createContext<NestedValidityReporter | null>(null);

export function JsonEditor({
  value,
  onChange,
  jsonType,
  id,
  autoFocus,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  jsonType?: JsonSchemaType;
  id?: string;
  autoFocus?: boolean;
}) {
  const [mode, setMode] = useState<EditorMode>("document");
  const [rawDraft, setRawDraft] = useState(() =>
    value === undefined ? "" : stringifyJsonValue(value),
  );
  const rawParsed = parseJsonText(rawDraft);

  function selectMode(next: EditorMode) {
    if (next === "json") {
      setRawDraft(value === undefined ? "" : stringifyJsonValue(value));
      setMode("json");
      return;
    }
    if (rawParsed.isErr) {
      return;
    }
    onChange(rawParsed.value);
    setMode("document");
  }

  const showRaw = mode === "json" || rawParsed.isErr;
  const valueAction = fieldValueAction({
    optional: true,
    value: value !== undefined ? value : rawDraft.trim().length > 0 ? rawDraft : undefined,
  });

  return (
    <EditorFrame
      mode={showRaw ? "json" : "document"}
      onModeChange={selectMode}
      documentDisabled={rawParsed.isErr}
      valueAction={
        valueAction
          ? {
              label: "Clear",
              onClick: () => {
                setRawDraft("");
                onChange(undefined);
              },
            }
          : undefined
      }
    >
      {showRaw ? (
        <RawPane
          id={id}
          autoFocus={autoFocus}
          text={rawDraft}
          jsonType={jsonType}
          error={rawParsed.isErr ? rawParsed.error : jsonTextError(rawDraft, jsonType)}
          onChange={(text) => {
            setRawDraft(text);
            const parsed = parseJsonText(text);
            if (parsed.isOk) {
              onChange(parsed.value);
            }
          }}
        />
      ) : (
        <TypedEditor
          value={value}
          jsonType={jsonType}
          depth={0}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
    </EditorFrame>
  );
}

/** String-form adapter: invalid JSON stays in the field and is not coerced. */
export function JsonTextEditor({
  value,
  onChange,
  jsonType,
  id,
  autoFocus,
  title,
  description,
  presentation = "dialog",
  fill = false,
  optional = false,
  defaultValue,
  onValidityChange,
}: {
  value: string;
  onChange: (value: string) => void;
  jsonType?: JsonSchemaType;
  id?: string;
  autoFocus?: boolean;
  title?: string;
  description?: string;
  /** `"inline"` when the editor is already hosted in a dialog. */
  presentation?: "dialog" | "inline";
  fill?: boolean;
  /** When true, the type selector includes `undefined` and unset stays omitted. */
  optional?: boolean;
  /** Schema `.default()` — required fields reset to this instead of clearing. */
  defaultValue?: JsonValue;
  onValidityChange?: (error: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [nestedError, setNestedError] = useState<string | null>(null);
  const saveError = jsonTextError(draft, jsonType) ?? nestedError;
  const dialogTitle = title ?? "JSON";
  const typeLabel = jsonType ? jsonTypeLabel(jsonType) : null;
  const paneHidesStaticType = jsonType !== undefined && jsonType.type !== "json";

  function reportValidity(error: string | null) {
    setNestedError(error);
    onValidityChange?.(error);
  }

  if (presentation === "inline") {
    return (
      <JsonTextEditorPane
        id={id}
        autoFocus={autoFocus}
        value={value}
        jsonType={jsonType}
        fill={fill}
        optional={optional}
        defaultValue={defaultValue}
        hideStaticType={paneHidesStaticType}
        onChange={onChange}
        onValidityChange={reportValidity}
      />
    );
  }

  function openEditor() {
    setDraft(value);
    setOpen(true);
  }

  function closeEditor() {
    setOpen(false);
  }

  function saveEditor() {
    if (saveError !== null || draft === value) {
      return;
    }
    onChange(draft);
    setOpen(false);
  }

  return (
    <>
      <JsonEditorSummary
        id={id}
        value={value}
        autoFocus={autoFocus}
        expanded={open}
        onEdit={openEditor}
      />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            openEditor();
            return;
          }
          closeEditor();
        }}
      >
        <DialogContent className="flex h-[min(85vh,48rem)] min-h-0 w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 truncate font-mono text-base">
              {dialogTitle}
              {typeLabel ? (
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {typeLabel}
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription>{description ?? "Invalid JSON is not saved."}</DialogDescription>
          </DialogHeader>
          {open ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <JsonTextEditorPane
                id={id ? `${id}-editor` : undefined}
                autoFocus
                value={draft}
                jsonType={jsonType}
                fill
                optional={optional}
                defaultValue={defaultValue}
                hideStaticType={paneHidesStaticType}
                onChange={setDraft}
                onValidityChange={setNestedError}
              />
            </div>
          ) : null}
          {saveError ? (
            <p role="alert" className="shrink-0 text-xs text-destructive">
              {saveError}
            </p>
          ) : null}
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveError !== null || draft === value}
              onClick={saveEditor}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function JsonEditorSummary({
  id,
  value,
  autoFocus,
  expanded,
  onEdit,
}: {
  id?: string;
  value: string;
  autoFocus?: boolean;
  expanded: boolean;
  onEdit: () => void;
}) {
  const parsed = parseJsonText(value);
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-border/40 bg-card">
      <div className="max-h-32 min-w-0 overflow-auto p-2 text-xs leading-relaxed wrap-anywhere">
        {parsed.isErr ? (
          <p role="alert" className="text-[10px] text-destructive">
            {parsed.error}
          </p>
        ) : parsed.value === undefined ? (
          <p className="font-mono text-xs text-muted-foreground">Empty</p>
        ) : (
          <JsonDocument value={parsed.value} compact />
        )}
      </div>
      <div className="flex shrink-0 border-t border-border/40 p-1.5">
        <Button
          type="button"
          id={id}
          autoFocus={autoFocus}
          variant="outline"
          size="sm"
          className="w-full"
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={onEdit}
        >
          <Pencil />
          Edit
        </Button>
      </div>
    </div>
  );
}

function jsonValueFromEditorText(text: string): JsonValue | undefined {
  const parsed = parseJsonText(text);
  return parsed.isOk ? parsed.value : text;
}

function applyFieldValueActionToText(action: FieldValueAction, onChange: (value: string) => void) {
  if (action.kind === "clear") {
    onChange("");
    return;
  }
  onChange(stringifyJsonValue(action.next));
}

function JsonTextEditorPane({
  value,
  onChange,
  jsonType,
  id,
  autoFocus,
  fill = false,
  hideStaticType = false,
  optional = false,
  defaultValue,
  onValidityChange,
}: {
  value: string;
  onChange: (value: string) => void;
  jsonType?: JsonSchemaType;
  id?: string;
  autoFocus?: boolean;
  fill?: boolean;
  hideStaticType?: boolean;
  optional?: boolean;
  defaultValue?: JsonValue;
  onValidityChange?: (error: string | null) => void;
}) {
  const parsed = parseJsonText(value);
  const [mode, setMode] = useState<EditorMode>("document");
  const [nestedErrors, setNestedErrors] = useState<Record<string, string>>({});
  const reportNestedError = useCallback<NestedValidityReporter>((key, error) => {
    setNestedErrors((current) => {
      if (error === null) {
        if (!(key in current)) {
          return current;
        }
        const next = { ...current };
        delete next[key];
        return next;
      }
      if (current[key] === error) {
        return current;
      }
      return { ...current, [key]: error };
    });
  }, []);
  const nestedError = Object.values(nestedErrors)[0] ?? null;

  useEffect(() => {
    onValidityChange?.(nestedError);
  }, [nestedError, onValidityChange]);

  function selectMode(next: EditorMode) {
    if (next === "document" && (parsed.isErr || nestedError !== null)) {
      return;
    }
    if (next === "json" && parsed.isOk && parsed.value !== undefined) {
      const pretty = stringifyJsonValue(parsed.value);
      if (pretty !== value) {
        onChange(pretty);
      }
    }
    setMode(next);
  }

  const showRaw = mode === "json" || parsed.isErr;
  const valueAction = fieldValueAction({
    optional,
    defaultValue,
    value: jsonValueFromEditorText(value),
  });

  return (
    <NestedJsonValidityContext.Provider value={reportNestedError}>
      <EditorFrame
        mode={showRaw ? "json" : "document"}
        onModeChange={selectMode}
        documentDisabled={parsed.isErr || nestedError !== null}
        fill={fill}
        valueAction={
          valueAction
            ? {
                label: valueAction.kind === "clear" ? "Clear" : "Reset",
                onClick: () => applyFieldValueActionToText(valueAction, onChange),
              }
            : undefined
        }
      >
        {showRaw ? (
          <RawPane
            id={id}
            autoFocus={autoFocus}
            text={value}
            jsonType={jsonType}
            error={parsed.isErr ? parsed.error : jsonTextError(value, jsonType)}
            fill={fill}
            onChange={onChange}
          />
        ) : (
          <TypedEditor
            value={parsed.isOk ? parsed.value : undefined}
            jsonType={jsonType}
            depth={0}
            hideStaticType={hideStaticType}
            optional={optional}
            showFieldClear={false}
            onChange={(next) => onChange(next === undefined ? "" : stringifyJsonValue(next))}
            autoFocus={autoFocus}
          />
        )}
      </EditorFrame>
    </NestedJsonValidityContext.Provider>
  );
}

function EditorFrame({
  mode,
  onModeChange,
  documentDisabled,
  valueAction,
  fill = false,
  children,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  documentDisabled: boolean;
  valueAction?: { label: "Clear" | "Reset"; onClick: () => void };
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-border/40 bg-card",
        fill && "h-full min-h-0 flex-1",
      )}
    >
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-1 border-b border-border/40 px-2 py-1.5">
        <ModeToggle mode={mode} onChange={onModeChange} documentDisabled={documentDisabled} />
        {valueAction ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={valueAction.onClick}
          >
            {valueAction.label}
          </Button>
        ) : null}
      </div>
      <div
        className={cn(
          "min-w-0 max-w-full p-3",
          fill && "min-h-0 flex-1",
          fill && mode === "json" ? "flex flex-col overflow-hidden" : fill && "overflow-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ModeToggle({
  mode,
  onChange,
  documentDisabled,
}: {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
  documentDisabled: boolean;
}) {
  return (
    <div className="flex items-center rounded-md bg-muted/60 p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={mode === "document"}
        disabled={documentDisabled}
        className={cn("h-5 px-1.5 text-[10px]", mode === "document" && "bg-background shadow-sm")}
        onClick={() => onChange("document")}
      >
        Document
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

function SchemaHint({ jsonType }: { jsonType?: JsonSchemaType }) {
  if (!jsonType || jsonType.type === "json") {
    return null;
  }
  return (
    <div className="flex min-h-0 max-h-48 shrink-0 flex-col overflow-hidden rounded-md border border-border/40 bg-muted/30">
      <p className="shrink-0 px-2 pt-1.5 pb-1 text-[10px] font-medium text-muted-foreground">
        Schema
      </p>
      <pre className="min-h-0 flex-1 overflow-auto px-2 pb-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground wrap-anywhere">
        {jsonTypeToZodText(jsonType)}
      </pre>
    </div>
  );
}

function nestedRawError(text: string, jsonType: JsonSchemaType): string | null {
  if (text.trim().length === 0) {
    return "JSON is required";
  }
  return jsonTextError(text, jsonType);
}

function NestedRawSwitch({
  enabled,
  value,
  jsonType,
  onChange,
  toolbar,
  children,
}: {
  enabled: boolean;
  value: JsonValue;
  jsonType: JsonSchemaType;
  onChange: (value: JsonValue) => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const report = useContext(NestedJsonValidityContext);
  const errorId = useId();
  const pretty = stringifyJsonValue(value);
  const [mode, setMode] = useState<EditorMode>("document");
  const [draft, setDraft] = useState(pretty);
  const error = mode === "json" ? nestedRawError(draft, jsonType) : null;

  useEffect(() => {
    if (mode === "document") {
      setDraft(pretty);
    }
  }, [pretty, mode]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    report?.(errorId, error);
    return () => report?.(errorId, null);
  }, [enabled, error, errorId, report]);

  if (!enabled) {
    return <>{children}</>;
  }

  function selectMode(next: EditorMode) {
    if (next === "document" && error !== null) {
      return;
    }
    if (next === "json") {
      setDraft(pretty);
    }
    setMode(next);
  }

  function onDraftChange(text: string) {
    setDraft(text);
    const nextError = nestedRawError(text, jsonType);
    if (nextError !== null) {
      return;
    }
    const parsed = parseJsonText(text);
    if (parsed.isOk && parsed.value !== undefined) {
      onChange(parsed.value);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ModeToggle mode={mode} onChange={selectMode} documentDisabled={error !== null} />
        {toolbar ? <span className="ml-auto shrink-0">{toolbar}</span> : null}
      </div>
      {mode === "json" ? (
        <RawPane text={draft} jsonType={jsonType} error={error} onChange={onDraftChange} />
      ) : (
        children
      )}
    </div>
  );
}

function RawPane({
  id,
  autoFocus,
  text,
  error,
  fill = false,
  jsonType,
  onChange,
}: {
  id?: string;
  autoFocus?: boolean;
  text: string;
  error: string | null;
  fill?: boolean;
  jsonType?: JsonSchemaType;
  onChange: (text: string) => void;
}) {
  return (
    <div
      className={cn(
        fill ? "flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden" : "grid gap-2",
      )}
    >
      <SchemaHint jsonType={jsonType} />
      <JsonCodeEditor
        id={id}
        autoFocus={autoFocus}
        value={text}
        fill={fill}
        invalid={error !== null}
        describedBy={error && id ? `${id}-error` : undefined}
        onChange={onChange}
      />
      {error ? (
        <p
          id={id ? `${id}-error` : undefined}
          role="alert"
          className="shrink-0 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Raw JSON textarea plus the Zod schema the value must match. */
export function JsonSchemaRawEditor({
  value,
  onChange,
  jsonType,
  id,
  autoFocus,
  fill = false,
}: {
  value: string;
  onChange: (value: string) => void;
  jsonType?: JsonSchemaType;
  id?: string;
  autoFocus?: boolean;
  fill?: boolean;
}) {
  return (
    <RawPane
      id={id}
      autoFocus={autoFocus}
      text={value}
      jsonType={jsonType}
      error={jsonTextError(value, jsonType)}
      fill={fill}
      onChange={onChange}
    />
  );
}

/** Schema-driven document editor without the document/JSON mode chrome. */
export function JsonTypedEditor({
  value,
  onChange,
  jsonType,
  autoFocus,
  optional = false,
  defaultValue,
  hideStaticType = false,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  jsonType: JsonSchemaType;
  autoFocus?: boolean;
  optional?: boolean;
  defaultValue?: JsonValue;
  hideStaticType?: boolean;
}) {
  return (
    <TypedEditor
      value={value}
      jsonType={jsonType}
      depth={0}
      onChange={onChange}
      autoFocus={autoFocus}
      optional={optional}
      defaultValue={defaultValue}
      hideStaticType={hideStaticType}
    />
  );
}

function TypedEditor({
  value,
  jsonType,
  depth,
  onChange,
  autoFocus,
  hideStaticType = false,
  optional = false,
  defaultValue,
  showFieldClear = true,
}: {
  value: JsonValue | undefined;
  jsonType?: JsonSchemaType;
  depth: number;
  onChange: (value: JsonValue | undefined) => void;
  autoFocus?: boolean;
  hideStaticType?: boolean;
  optional?: boolean;
  defaultValue?: JsonValue;
  showFieldClear?: boolean;
}) {
  if (depth >= MAX_JSON_TREE_DEPTH && value !== undefined) {
    return <RawNodeEditor value={value} onChange={onChange} />;
  }

  const variants = editorVariants(jsonType);
  const selected = resolveEditorVariant(value, variants, optional);
  const omitted = optional && value === undefined;
  const onlyType = variants.length === 1 ? variants[0] : undefined;
  const showSelect = variants.length > 1;
  const mismatch =
    value !== undefined && jsonType !== undefined && jsonType.type !== "json"
      ? !valueMatchesJsonType(value, jsonType)
      : false;

  function selectType(next: JsonSchemaType | undefined) {
    if (next === undefined) {
      if (!optional) {
        throw new Error("json editor type select chose undefined on a required slot");
      }
      onChange(undefined);
      return;
    }
    onChange(defaultValueForJsonType(next));
  }

  const typeControl = showSelect ? (
    <TypeSelect
      variants={variants}
      selected={selected}
      allowUndefined={optional}
      onChange={selectType}
    />
  ) : null;
  const staticType =
    !showSelect && !hideStaticType && onlyType ? (
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {jsonTypeLabel(onlyType)}
      </span>
    ) : null;

  const bodyType = showSelect ? selected : onlyType;
  const body = bodyType ? (
    <TypedValue
      value={value}
      jsonType={bodyType}
      depth={depth}
      omitted={omitted}
      allowEmpty={optional}
      onChange={onChange}
      autoFocus={autoFocus}
    />
  ) : omitted && showSelect ? (
    <p className="font-mono text-xs text-muted-foreground">omitted</p>
  ) : null;
  const block = bodyType?.type === "array" || bodyType?.type === "object";
  const valueAction =
    !showFieldClear || (optional && showSelect)
      ? undefined
      : fieldValueAction({ optional, defaultValue, value });

  return (
    <div className="min-w-0 space-y-2">
      {mismatch ? (
        <p role="alert" className="text-[10px] text-destructive">
          Value does not match {jsonType ? jsonTypeLabel(jsonType) : "schema"}. Choose a type or
          edit JSON.
        </p>
      ) : null}
      <OptionalValueRow
        valueAction={valueAction}
        typeHint={staticType}
        trailing={typeControl}
        align={block ? "start" : "center"}
        onAction={(action) => {
          if (action.kind === "clear") {
            onChange(undefined);
            return;
          }
          onChange(action.next);
        }}
      >
        {body}
      </OptionalValueRow>
    </div>
  );
}

function TypedValue({
  value,
  jsonType,
  depth,
  onChange,
  autoFocus,
  omitted = false,
  allowEmpty = false,
}: {
  value: JsonValue | undefined;
  jsonType: JsonSchemaType;
  depth: number;
  onChange: (value: JsonValue | undefined) => void;
  autoFocus?: boolean;
  omitted?: boolean;
  allowEmpty?: boolean;
}) {
  if (jsonType.type === "array") {
    const items = Array.isArray(value) ? value : [];
    return (
      <ArrayEditor
        items={items}
        itemType={jsonType.items}
        depth={depth}
        omitted={omitted}
        onChange={onChange}
        autoFocus={autoFocus}
      />
    );
  }

  if (jsonType.type === "object") {
    if (omitted) {
      return (
        <div className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">omitted</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            autoFocus={autoFocus}
            onClick={() => onChange(defaultValueForJsonType(jsonType))}
          >
            Set object
          </Button>
        </div>
      );
    }
    const obj = value !== undefined && isJsonObject(value) ? value : {};
    return <ObjectEditor obj={obj} schema={jsonType} depth={depth} onChange={onChange} />;
  }

  if (jsonType.type === "union") {
    throw new Error("json editor TypedValue received a union; unwrap it first");
  }

  return (
    <PrimitiveEditor
      value={value}
      jsonType={jsonType}
      omitted={omitted}
      allowEmpty={allowEmpty}
      onChange={onChange}
      autoFocus={autoFocus}
    />
  );
}

function FieldValueActionButton({
  label,
  onClick,
}: {
  label: "Clear" | "Reset";
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="shrink-0 text-muted-foreground"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function OptionalValueRow({
  valueAction,
  onAction,
  children,
  typeHint,
  trailing,
  align = "start",
}: {
  valueAction?: FieldValueAction;
  onAction: (action: FieldValueAction) => void;
  children: ReactNode;
  typeHint?: ReactNode;
  trailing?: ReactNode;
  align?: "start" | "center";
}) {
  return (
    <div className={cn("flex min-w-0 gap-2", align === "center" ? "items-center" : "items-start")}>
      <div className="min-w-0 flex-1">{children}</div>
      {typeHint}
      {trailing}
      {valueAction ? (
        <FieldValueActionButton
          label={valueAction.kind === "clear" ? "Clear" : "Reset"}
          onClick={() => onAction(valueAction)}
        />
      ) : null}
    </div>
  );
}

function AddItemButton({
  onClick,
  label = "Add item",
  autoFocus,
}: {
  onClick: () => void;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <Button type="button" variant="outline" size="sm" autoFocus={autoFocus} onClick={onClick}>
      <Plus />
      {label}
    </Button>
  );
}

function ArrayEditor({
  items,
  itemType,
  depth,
  onChange,
  autoFocus,
  omitted = false,
}: {
  items: JsonValue[];
  itemType: JsonSchemaType;
  depth: number;
  onChange: (value: JsonValue) => void;
  autoFocus?: boolean;
  omitted?: boolean;
}) {
  function addDefault() {
    onChange([...items, defaultValueForJsonType(itemType)]);
  }

  function replace(index: number, next: JsonValue | undefined) {
    if (next === undefined) {
      onChange(items.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    onChange(items.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  if (omitted) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="font-mono text-xs text-muted-foreground">omitted</p>
        <AddItemButton label="Create list" onClick={() => onChange([])} autoFocus={autoFocus} />
      </div>
    );
  }

  return (
    <NestedRawSwitch
      enabled={depth > 0}
      value={items}
      jsonType={{ type: "array", items: itemType }}
      onChange={onChange}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">[{items.length}]</span>
        </div>
        {items.length > 0 ? (
          <ol className="min-w-0 list-none space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex min-w-0 items-start gap-2">
                <span
                  className={cn(
                    "w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground",
                    isJsonObject(item) || Array.isArray(item)
                      ? "pt-1.5 leading-4"
                      : "flex h-8 items-center justify-end leading-none",
                  )}
                >
                  {index}.
                </span>
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                  <TypedEditor
                    value={item}
                    jsonType={itemType}
                    depth={depth + 1}
                    onChange={(next) => replace(index, next)}
                  />
                </div>
                <RemoveButton label={`item ${index}`} onClick={() => replace(index, undefined)} />
              </li>
            ))}
          </ol>
        ) : null}
        <div className={items.length > 0 ? "mt-2" : undefined}>
          <AddItemButton onClick={addDefault} autoFocus={autoFocus} />
        </div>
      </div>
    </NestedRawSwitch>
  );
}

function ObjectEditor({
  obj,
  schema,
  depth,
  onChange,
}: {
  obj: Record<string, JsonValue>;
  schema: Extract<JsonSchemaType, { type: "object" }>;
  depth: number;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const known = new Set(schema.fields.map((field) => field.name));
  const extraKeys = Object.keys(obj).filter((key) => !known.has(key));
  const [addError, setAddError] = useState<string | null>(null);

  function setField(name: string, next: JsonValue | undefined) {
    const copy: Record<string, JsonValue> = { ...obj };
    if (next === undefined) {
      delete copy[name];
    } else {
      copy[name] = next;
    }
    onChange(Object.keys(copy).length === 0 ? undefined : copy);
  }

  function addExtra(key: string, type: JsonSchemaType) {
    const result = addObjectKey(obj, [], key, defaultValueForJsonType(type));
    if (result.isErr) {
      setAddError(result.error);
      return false;
    }
    setAddError(null);
    onChange(result.value);
    return true;
  }

  return (
    <NestedRawSwitch enabled={depth > 0} value={obj} jsonType={schema} onChange={onChange}>
      <div className="min-w-0 space-y-6">
        {schema.fields.length === 0 && extraKeys.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">{"{}"}</p>
        ) : null}
        {schema.fields.map((field) => {
          const child = obj[field.name];
          const nested = child !== undefined && (isJsonObject(child) || Array.isArray(child));
          return (
            <section key={field.name} className="min-w-0 space-y-2">
              <p className="flex items-center gap-1.5">
                <span className={cn("min-w-0 truncate font-mono text-xs", JSON_TOKEN_CLASS.key)}>
                  {field.name}
                </span>
                {field.schema.type === "union" || !field.required ? null : (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {jsonTypeLabel(field.schema)}
                  </span>
                )}
                {field.default !== undefined ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    default {JSON.stringify(field.default)}
                  </span>
                ) : field.required ? null : (
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    (optional)
                  </span>
                )}
                {nested && isJsonObject(child) ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {`{${Object.keys(child).length}}`}
                  </span>
                ) : null}
                {nested && Array.isArray(child) ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    [{child.length}]
                  </span>
                ) : null}
              </p>
              <div className={cn("min-w-0", nested && "pl-4")}>
                <TypedEditor
                  value={child}
                  jsonType={field.schema}
                  depth={depth + 1}
                  hideStaticType={field.required && field.schema.type !== "union"}
                  optional={!field.required}
                  defaultValue={field.default}
                  onChange={(next) => setField(field.name, next)}
                />
              </div>
            </section>
          );
        })}
        {extraKeys.map((key) => (
          <FreeformField
            key={key}
            name={key}
            value={obj[key] as JsonValue}
            extras={obj}
            depth={depth}
            onChange={onChange}
          />
        ))}
        {schema.extra ? (
          <div className="space-y-1">
            <ObjectAddRow error={addError} onAdd={addExtra} />
          </div>
        ) : null}
      </div>
    </NestedRawSwitch>
  );
}

function FreeformField({
  name,
  value,
  extras,
  depth,
  onChange,
}: {
  name: string;
  value: JsonValue;
  extras: Record<string, JsonValue>;
  depth: number;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const [renameError, setRenameError] = useState<string | null>(null);
  const nested = isJsonObject(value) || Array.isArray(value);

  function rename(next: string) {
    const result = renameObjectKey(extras, [], name, next);
    if (result.isErr) {
      setRenameError(result.error);
      return false;
    }
    setRenameError(null);
    onChange(result.value);
    return true;
  }

  return (
    <section className="min-w-0 space-y-2">
      <p className="flex items-center gap-1.5">
        <KeyEditor name={name} error={renameError} onRename={rename} />
        <span className="ml-auto shrink-0">
          <RemoveButton
            label={name}
            onClick={() => onChange(removeAtPath(extras, [name] satisfies JsonPath))}
          />
        </span>
      </p>
      <div className={cn("min-w-0", nested && "pl-3.5")}>
        <TypedEditor
          value={value}
          jsonType={{ type: "json" }}
          depth={depth + 1}
          onChange={(next) => {
            if (next === undefined) {
              onChange(removeAtPath(extras, [name]));
              return;
            }
            onChange({ ...extras, [name]: next });
          }}
        />
      </div>
    </section>
  );
}

function PrimitiveEditor({
  value,
  jsonType,
  onChange,
  autoFocus,
  omitted = false,
  allowEmpty = false,
  hideStaticType = false,
}: {
  value: JsonValue | undefined;
  jsonType: JsonSchemaType;
  onChange: (value: JsonValue | undefined) => void;
  autoFocus?: boolean;
  omitted?: boolean;
  allowEmpty?: boolean;
  hideStaticType?: boolean;
}) {
  if (
    jsonType.type === "string" &&
    (value === undefined || typeof value === "string") &&
    !(jsonType.options && jsonType.options.length > 0)
  ) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus={autoFocus}
          value={typeof value === "string" ? value : ""}
          placeholder={omitted ? "omitted" : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(EDITOR_CONTROL_CLASS, "flex-1", JSON_TOKEN_CLASS.string)}
          spellCheck={false}
        />
      </div>
    );
  }

  if (jsonType.type === "boolean") {
    return (
      <BooleanEditor
        value={typeof value === "boolean" ? value : undefined}
        omitted={omitted}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    );
  }

  if (jsonType.type === "number") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberEditor
            value={typeof value === "number" ? value : undefined}
            allowEmpty={allowEmpty}
            omitted={omitted}
            autoFocus={autoFocus}
            onChange={onChange}
          />
        </div>
      </div>
    );
  }

  if (jsonType.type === "string" && jsonType.options && jsonType.options.length > 0) {
    return (
      <div className="flex items-center gap-1.5">
        <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
          <SelectTrigger size="sm" className={cn(EDITOR_CONTROL_CLASS, "w-auto")}>
            <SelectValue placeholder={omitted ? "omitted" : "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {jsonType.options.map((option) => (
              <SelectItem key={option} value={option} className="font-mono text-xs">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (omitted && (jsonType.type === "null" || jsonType.type === "literal")) {
    return (
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">omitted</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          autoFocus={autoFocus}
          onClick={() => onChange(defaultValueForJsonType(jsonType))}
        >
          Set {jsonTypeLabel(jsonType)}
        </Button>
      </div>
    );
  }

  if (value === undefined) {
    return (
      <ValueComposer
        jsonType={jsonType}
        onCommit={onChange}
        autoFocus={autoFocus}
        hideStaticType={hideStaticType}
      />
    );
  }

  if (jsonType.type === "null" || value === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className={cn("font-mono text-[10px]", JSON_TOKEN_CLASS.null)}>null</span>
      </div>
    );
  }

  if (jsonType.type === "literal") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(jsonType.value)}
        </span>
      </div>
    );
  }

  const text = typeof value === "string" ? value : stringifyJsonValue(value);
  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className={cn(EDITOR_CONTROL_CLASS, "flex-1", JSON_TOKEN_CLASS.string)}
        spellCheck={false}
      />
    </div>
  );
}

function ValueComposer({
  jsonType,
  onCommit,
  autoFocus,
  trailing,
  commitLabel = "Add",
  hideStaticType = false,
}: {
  jsonType: JsonSchemaType;
  onCommit: (value: JsonValue) => void;
  autoFocus?: boolean;
  trailing?: ReactNode;
  commitLabel?: string;
  hideStaticType?: boolean;
}) {
  const variants = editorVariants(jsonType);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = variants[index] ?? jsonType;
  const needsText = composerNeedsText(current);
  const showTypeHint = trailing == null && !hideStaticType;

  function commit(text = draft) {
    const parsed = valueFromComposerDraft(current, text);
    if (parsed.isErr) {
      setError(parsed.error);
      return;
    }
    if (parsed.value === undefined) {
      setError("Value is required");
      return;
    }
    setError(null);
    onCommit(parsed.value);
    setDraft("");
  }

  return (
    <div className="space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {needsText ? (
          <Input
            autoFocus={autoFocus}
            value={draft}
            placeholder={
              jsonType.type === "array" || jsonType.type === "object" ? undefined : "Add"
            }
            aria-label="New value"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            className={cn(EDITOR_CONTROL_CLASS, "flex-1")}
            spellCheck={false}
          />
        ) : null}
        {showTypeHint ? (
          <TypeHint
            variants={variants}
            selected={current}
            onChange={
              variants.length > 1
                ? (next) => {
                    const nextIndex = variants.indexOf(next);
                    setIndex(nextIndex >= 0 ? nextIndex : 0);
                    setError(null);
                  }
                : undefined
            }
          />
        ) : null}
        {trailing}
        <AddItemButton onClick={() => commit()} label={commitLabel} />
      </div>
      {error ? (
        <p role="alert" className="text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ObjectAddRow({
  error,
  onAdd,
}: {
  error: string | null;
  onAdd: (key: string, type: JsonSchemaType) => boolean;
}) {
  const variants = editorVariants(undefined);
  const [key, setKey] = useState("");
  const [index, setIndex] = useState(0);
  const current = variants[index] ?? { type: "string" as const };

  function add() {
    const next = key.trim();
    if (onAdd(next, current)) {
      setKey("");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          value={key}
          aria-label="New key"
          placeholder="key"
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className={cn(EDITOR_CONTROL_CLASS, "flex-1")}
          spellCheck={false}
        />
        <TypeSelect
          variants={variants}
          selected={current}
          onChange={(next) => {
            if (next === undefined) {
              throw new Error("json editor type select chose undefined");
            }
            const nextIndex = variants.indexOf(next);
            setIndex(nextIndex >= 0 ? nextIndex : 0);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Add key"
          onClick={add}
        >
          <Plus />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TypeHint({
  variants,
  selected,
  onChange,
  hideStatic = false,
}: {
  variants: JsonSchemaType[];
  selected: JsonSchemaType;
  onChange?: (schema: JsonSchemaType) => void;
  hideStatic?: boolean;
}) {
  if (variants.length > 1 && onChange) {
    return (
      <TypeSelect
        variants={variants}
        selected={selected}
        onChange={(next) => {
          if (next === undefined) {
            throw new Error("json editor type select chose undefined");
          }
          onChange(next);
        }}
      />
    );
  }
  if (hideStatic) {
    return null;
  }
  return (
    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
      {jsonTypeLabel(selected)}
    </span>
  );
}

function TypeSelect({
  variants,
  selected,
  onChange,
  allowUndefined = false,
}: {
  variants: JsonSchemaType[];
  selected: JsonSchemaType | undefined;
  allowUndefined?: boolean;
  onChange: (schema: JsonSchemaType | undefined) => void;
}) {
  const unsetValue = "undefined";
  const selectedIndex =
    selected === undefined
      ? -1
      : variants.findIndex(
          (variant) =>
            variant.type === selected.type && jsonTypeLabel(variant) === jsonTypeLabel(selected),
        );
  const selectValue =
    selected === undefined && allowUndefined
      ? unsetValue
      : String(selectedIndex >= 0 ? selectedIndex : 0);

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => {
        if (next === unsetValue) {
          if (!allowUndefined) {
            throw new Error("json editor type select chose undefined on a required slot");
          }
          onChange(undefined);
          return;
        }
        const variant = variants[Number(next)];
        if (!variant) {
          throw new Error(`json editor type select missing variant ${next}`);
        }
        onChange(variant);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="JSON type"
        className={cn(EDITOR_CONTROL_CLASS, "w-40 shrink-0 justify-between gap-1")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowUndefined ? (
          <SelectItem value={unsetValue} className="font-mono text-xs">
            undefined
          </SelectItem>
        ) : null}
        {variants.map((variant, index) => (
          <SelectItem
            key={`${variant.type}-${index}`}
            value={String(index)}
            className="font-mono text-xs"
          >
            {jsonTypeLabel(variant)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KeyEditor({
  name,
  error,
  onRename,
}: {
  name: string;
  error: string | null;
  onRename: (next: string) => boolean;
}) {
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(name);
    }
  }, [name, focused]);

  function commit() {
    const next = draft.trim();
    if (next === name) {
      return;
    }
    if (!onRename(next)) {
      return;
    }
    setDraft(next);
  }

  return (
    <div className="min-w-0">
      <Input
        value={focused ? draft : name}
        aria-label={`Key ${name}`}
        aria-invalid={error !== null}
        onFocus={() => {
          setFocused(true);
          setDraft(name);
        }}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={cn(EDITOR_CONTROL_CLASS, "max-w-40", JSON_TOKEN_CLASS.key)}
        spellCheck={false}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BooleanEditor({
  value,
  omitted,
  autoFocus,
  onChange,
}: {
  value: boolean | undefined;
  omitted: boolean;
  autoFocus?: boolean;
  onChange: (value: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = omitted;
    }
  }, [omitted]);
  const checked = value === true;
  return (
    <div className="flex items-center gap-1.5">
      <label className="inline-flex min-w-0 items-center gap-1.5">
        <input
          ref={ref}
          type="checkbox"
          autoFocus={autoFocus}
          className="size-4 rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            "font-mono text-[10px]",
            omitted ? "text-muted-foreground" : JSON_TOKEN_CLASS.boolean,
          )}
        >
          {omitted ? "omitted" : String(checked)}
        </span>
      </label>
    </div>
  );
}

function NumberEditor({
  value,
  onChange,
  autoFocus,
  allowEmpty = false,
  omitted = false,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  autoFocus?: boolean;
  allowEmpty?: boolean;
  omitted?: boolean;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) {
      setDraft(value === undefined ? "" : String(value));
      setError(null);
    }
  }, [value, focused]);

  function commit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      if (allowEmpty) {
        setError(null);
        if (value !== undefined) {
          onChange(undefined);
        }
        return;
      }
      setError("Number is required");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setError("Must be a finite number");
      return;
    }
    setError(null);
    if (parsed !== value) {
      onChange(parsed);
    }
  }

  const display = value === undefined ? "" : String(value);

  return (
    <div className="min-w-0">
      <Input
        autoFocus={autoFocus}
        inputMode="decimal"
        value={focused ? draft : display}
        placeholder={omitted ? "omitted" : undefined}
        aria-invalid={error !== null}
        onFocus={() => {
          setFocused(true);
          setDraft(display);
        }}
        onBlur={() => {
          commit(draft);
          setFocused(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={cn(EDITOR_CONTROL_CLASS, JSON_TOKEN_CLASS.number)}
        spellCheck={false}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={`Remove ${label}`}
      title={`Remove ${label}`}
      onClick={onClick}
    >
      <Trash2 />
    </Button>
  );
}

function RawNodeEditor({
  value,
  onChange,
}: {
  value: JsonValue;
  onChange: (value: JsonValue) => void;
}) {
  const pretty = stringifyJsonValue(value);
  const [draft, setDraft] = useState(pretty);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focused || error) {
      return;
    }
    setDraft(pretty);
  }, [pretty, focused, error]);

  function commit(text: string) {
    const parsed = parseJsonText(text);
    if (parsed.isErr) {
      setError(parsed.error);
      return;
    }
    if (parsed.value === undefined) {
      setError("JSON is required");
      return;
    }
    setError(null);
    onChange(parsed.value);
  }

  return (
    <div className="grid min-w-0 gap-1">
      <JsonCodeEditor
        value={focused || error ? draft : pretty}
        invalid={error !== null}
        onChange={(text) => {
          setFocused(true);
          setDraft(text);
        }}
        onBlur={(text) => {
          commit(text);
          setFocused(false);
        }}
      />
      {error ? (
        <p role="alert" className="text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
