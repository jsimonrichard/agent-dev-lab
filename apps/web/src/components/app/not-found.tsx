import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

type NotFoundPageProps = {
  /** When true, use the in-app page chrome (header bar). Render inside `ResizableAppShell`. */
  inAppShell?: boolean;
  title?: string;
  description?: string;
};

export function NotFoundPage({
  inAppShell = false,
  title = "Page not found",
  description = "This URL does not match any route or resource in the loaded ADL project.",
}: NotFoundPageProps) {
  const body = (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FileQuestion className="size-6" />
      </div>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button asChild size="sm">
          <Link to="/">Back to overview</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/workflows">Browse workflows</Link>
        </Button>
      </div>
    </div>
  );

  if (!inAppShell) {
    return (
      <div className="flex min-h-svh flex-col bg-background font-sans text-foreground antialiased">
        {body}
      </div>
    );
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border/40 px-4">
        <h1 className="text-sm font-semibold">Not found</h1>
      </header>
      {body}
    </div>
  );
}
