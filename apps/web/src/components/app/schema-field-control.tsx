import type { WorkflowInputField } from "#/lib/inspector/inspector-types";

import { JsonTextEditor, JsonTypedEditor } from "@/components/app/json-editor";
import { Label } from "@/components/ui/label";
import {
  jsonTypeFromField,
  jsonTypeLabel,
  jsonValueFromSchemaField,
  schemaFieldFromJsonValue,
} from "@/lib/json-editor";

function SchemaFieldLabel({ htmlFor, field }: { htmlFor: string; field: WorkflowInputField }) {
  const typeHint =
    field.kind === "json" ? (field.jsonType ? jsonTypeLabel(field.jsonType) : "json") : field.kind;
  return (
    <Label htmlFor={htmlFor}>
      {field.name}
      <span className="font-mono text-xs font-normal text-muted-foreground">{typeHint}</span>
      {field.default !== undefined ? (
        <span className="font-mono text-xs font-normal text-muted-foreground">
          default {JSON.stringify(field.default)}
        </span>
      ) : field.required ? null : (
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

  if (field.kind === "json") {
    return (
      <div className="grid gap-3">
        <SchemaFieldLabel htmlFor={id} field={field} />
        <JsonTextEditor
          id={id}
          autoFocus={autoFocus}
          value={typeof value === "string" ? value : ""}
          jsonType={field.jsonType}
          title={field.name}
          description={field.description}
          presentation={jsonPresentation}
          optional={!field.required}
          defaultValue={field.default}
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
    <div className="grid gap-3">
      <SchemaFieldLabel htmlFor={id} field={field} />
      <JsonTypedEditor
        value={jsonValueFromSchemaField(field, value)}
        jsonType={jsonTypeFromField(field)}
        optional={!field.required}
        defaultValue={field.default}
        hideStaticType
        autoFocus={autoFocus}
        onChange={(next) => onChange(schemaFieldFromJsonValue(field, next))}
      />
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}
