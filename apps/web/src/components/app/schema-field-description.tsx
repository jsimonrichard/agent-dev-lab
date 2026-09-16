/** Help text from Zod `.describe()`, omitted when the schema has none. */
export function SchemaFieldDescription({ children }: { children?: string }) {
  if (!children) {
    return null;
  }
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
