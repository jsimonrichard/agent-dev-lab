import type { ComponentType, ReactNode } from "react";

export function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function SettingRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-muted-foreground sm:w-28">{label}</dt>
      <dd className={mono ? "min-w-0 break-all font-mono text-[11px]" : "min-w-0"}>{value}</dd>
    </div>
  );
}
