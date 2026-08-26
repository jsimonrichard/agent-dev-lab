import { useEffect, useId, useState, type ReactNode } from "react";
import { Pencil, Trash2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ItemActionsMenuExtraAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
};

export function ItemActionsMenu({
  children,
  name,
  renameLabel = "Rename",
  deleteLabel = "Delete",
  extraActions,
  onRename,
  onDelete,
}: {
  children: ReactNode;
  name: string;
  renameLabel?: string;
  deleteLabel?: string;
  extraActions?: ReadonlyArray<ItemActionsMenuExtraAction>;
  onRename: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const nameId = useId();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (renameOpen) {
      setDraft(name);
      setError(null);
    }
  }, [name, renameOpen]);

  async function handleRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onRename(trimmed);
      setRenameOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || pending) {
      return;
    }
    setPending(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => {
              setRenameOpen(true);
            }}
          >
            <Pencil />
            {renameLabel}
          </ContextMenuItem>
          {extraActions?.map((action) => {
            const Icon = action.icon;
            return (
              <ContextMenuItem key={action.label} onSelect={action.onSelect}>
                {Icon ? <Icon /> : null}
                {action.label}
              </ContextMenuItem>
            );
          })}
          {onDelete ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={() => {
                  void handleDelete();
                }}
              >
                <Trash2 />
                {deleteLabel}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={(event) => void handleRename(event)}>
            <DialogHeader>
              <DialogTitle>{renameLabel}</DialogTitle>
              <DialogDescription>
                The id stays the same. Only the display name changes.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
              />
              {error && renameOpen ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteError !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete failed</DialogTitle>
            <DialogDescription>{deleteError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setDeleteError(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
