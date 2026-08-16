import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  deleteDescription = "This cannot be undone.",
  extraActions,
  onRename,
  onDelete,
}: {
  children: ReactNode;
  name: string;
  renameLabel?: string;
  deleteLabel?: string;
  deleteDescription?: string;
  extraActions?: ReadonlyArray<ItemActionsMenuExtraAction>;
  onRename: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const nameId = useId();
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const deleteSubmitRef = useRef<HTMLButtonElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    if (!onDelete || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
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
                onSelect={() => {
                  setDeleteOpen(true);
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

      {onDelete ? (
        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) {
              setError(null);
            }
          }}
        >
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              deleteSubmitRef.current?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing || event.repeat) {
                return;
              }
              event.preventDefault();
              deleteFormRef.current?.requestSubmit();
            }}
          >
            <form ref={deleteFormRef} onSubmit={(event) => void handleDelete(event)}>
              <DialogHeader>
                <DialogTitle>{deleteLabel}</DialogTitle>
                <DialogDescription>{deleteDescription}</DialogDescription>
              </DialogHeader>
              {error && deleteOpen ? <p className="text-xs text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  ref={deleteSubmitRef}
                  type="submit"
                  variant="destructive"
                  disabled={pending}
                >
                  Delete
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
