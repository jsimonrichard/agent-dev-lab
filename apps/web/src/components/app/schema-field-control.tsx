import type { WorkflowInputField } from "#/lib/inspector/inspector-types";

import { JsonTextEditor } from "@/components/app/json-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jsonTypeLabel } from "@/lib/json-editor";

const UNSET_SELECT_VALUE = "__unset__";

function SchemaFieldLabel({ htmlFor, field }: { htmlFor: string; field: WorkflowInputField }) {
  const typeHint =
    field.kind === "json" ? (field.jsonType ? jsonTypeLabel(field.jsonType) : "json") : field.kind;
  return (
    <Label htmlFor={htmlFor}>
      {field.name}
      <span className="font-mono text-xs font-normal text-muted-foreground">{typeHint}</span>
      {field.required ? null : (
        <span className="font-normal text-muted-foreground">(optional)</span>
      )}
    </Label>
  );
}

/** Shared Zod-field control used by workflow start and agent toolProviderContext forms. */
export function SchemaFieldControl({
  idPrefix,
  field,
  value,
  onChange,
  autoFocus,
  jsonPresentation = "dialog",
  onJsonValidityChange,
}: {
  idPrefix: string;
  field: WorkflowInputField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  autoFocus?: boolean;
  jsonPresentation?: "dialog" | "inline";
  onJsonValidityChange?: (error: string | null) => void;
}) {
  const id = `${idPrefix}-${field.name}`;

  if (field.kind === "boolean") {
    if (!field.required) {
      const selected =
        value === true || value === "true"
          ? "true"
          : value === false || value === "false"
            ? "false"
            : UNSET_SELECT_VALUE;
      return (
        <div className="grid gap-2">
          <SchemaFieldLabel htmlFor={id} field={field} />
          <Select
            value={selected}
            onValueChange={(next) => {
              if (next === UNSET_SELECT_VALUE) {
                onChange("");
                return;
              }
              onChange(next === "true");
            }}
          >
            <SelectTrigger id={id} className="w-full" autoFocus={autoFocus}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET_SELECT_VALUE}>—</SelectItem>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="size-4 rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <SchemaFieldLabel htmlFor={id} field={field} />
      </div>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <div className="grid gap-2">
        <SchemaFieldLabel htmlFor={id} field={field} />
        <Select
          value={typeof value === "string" && value !== "" ? value : undefined}
          onValueChange={(next) => onChange(next === UNSET_SELECT_VALUE ? "" : next)}
        >
          <SelectTrigger id={id} className="w-full" autoFocus={autoFocus}>
            <SelectValue placeholder={field.required ? "Select…" : "—"} />
          </SelectTrigger>
          <SelectContent>
            {field.required ? null : <SelectItem value={UNSET_SELECT_VALUE}>—</SelectItem>}
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  if (field.kind === "json") {
    return (
      <div className="grid gap-2">
        <SchemaFieldLabel htmlFor={id} field={field} />
        <JsonTextEditor
          id={id}
          autoFocus={autoFocus}
          value={typeof value === "string" ? value : ""}
          jsonType={field.jsonType}
          title={field.name}
          description={field.description}
          presentation={jsonPresentation}
          onChange={onChange}
          onValidityChange={onJsonValidityChange}
        />
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <SchemaFieldLabel htmlFor={id} field={field} />
      <Input
        id={id}
        autoFocus={autoFocus}
        required={field.required}
        type={field.kind === "number" ? "number" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}
