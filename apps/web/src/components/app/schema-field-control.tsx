import type { WorkflowInputField } from "#/lib/inspector/inspector-types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const UNSET_SELECT_VALUE = "__unset__";

/** Shared Zod-field control used by workflow start and agent toolProviderContext forms. */
export function SchemaFieldControl({
  idPrefix,
  field,
  value,
  onChange,
  autoFocus,
}: {
  idPrefix: string;
  field: WorkflowInputField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  autoFocus?: boolean;
}) {
  const id = `${idPrefix}-${field.name}`;
  const label = field.required ? field.name : `${field.name} (optional)`;

  if (field.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="size-4 rounded border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
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
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          autoFocus={autoFocus}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20 font-mono text-xs"
          spellCheck={false}
        />
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
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
