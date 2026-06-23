import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

/**
 * Shape returned by `GET /api/admin/project-categories`. Mirrored from
 * `ProjectCategory.to_dict()` on the backend.
 */
export interface ProjectCategory {
  id: number;
  name: string;
  description: string | null;
  project_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Payload the parent feeds into save/update mutations. Both fields are
 * optional on update (PUT semantics: only the keys present get applied), but
 * `name` is always required on create — the parent component enforces that
 * via the calling code, not here.
 */
export interface CategoryFormPayload {
  name: string;
  description: string | null;
}

interface CategoryManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProjectCategory[];
  isLoading: boolean;
  /** Disable mutation buttons while a save/delete is in-flight. */
  isMutating: boolean;
  onCreate: (payload: CategoryFormPayload) => Promise<void>;
  onUpdate: (id: number, payload: CategoryFormPayload) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

/**
 * Admin modal for managing project categories. List + inline create form +
 * per-row inline edit + per-row delete with confirmation.
 *
 * Why a single modal rather than a separate dialog per operation: the admin
 * thinks of "manage categories" as one unified workflow (look at the list,
 * add or fix a few, close). Splitting create/edit into separate dialogs
 * would force the admin to keep re-opening the manager between actions.
 *
 * The actual server round-trips are owned by the parent via the four
 * callback props — this component only manages the editor's local form
 * state and the delete confirmation flow.
 */
const CategoryManagerModal = ({
  open,
  onOpenChange,
  categories,
  isLoading,
  isMutating,
  onCreate,
  onUpdate,
  onDelete,
}: CategoryManagerModalProps) => {
  // Inline create-form state. We don't reset it when the modal closes
  // automatically — if the user accidentally closes the modal mid-type, they
  // get their text back on reopen. Reset happens only after a successful POST.
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Edit-in-place: when a row's pencil is clicked, `editingId` holds its id
  // and the input fields below show editable controls.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Delete confirmation: track which category id the AlertDialog is about
  // to delete. Distinct from `editingId` so editing and confirming-delete
  // don't share state.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Editing state must reset whenever the modal closes so a re-open doesn't
  // show stale input on a row that no longer exists / has changed. This is a
  // legitimate prop→state sync (the React 19 carve-out app/CLAUDE.md
  // documents — internal UI state synced to an external `open` prop).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setPendingDeleteId(null);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const startEdit = (cat: ProjectCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await onCreate({
      name,
      description: newDescription.trim() || null,
    });
    // Clear the form only on success. If the mutation throws (e.g. 409 name
    // collision) the parent surfaces a toast and the form stays intact so
    // the admin can adjust the name without retyping the description.
    setNewName('');
    setNewDescription('');
  };

  const handleEditSave = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    await onUpdate(id, {
      name,
      description: editDescription.trim() || null,
    });
    cancelEdit();
  };

  const pendingDelete = pendingDeleteId ? categories.find((c) => c.id === pendingDeleteId) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage project categories</DialogTitle>
            <DialogDescription className="text-[#a3a3a3]">
              Categories are used to organize and filter projects. Deleting a category
              auto-unassigns its projects (they become uncategorized).
            </DialogDescription>
          </DialogHeader>

          {/* Inline create form */}
          <div className="border border-[rgba(255,255,255,0.08)] rounded-lg p-3 bg-[rgba(255,255,255,0.02)]">
            <p className="text-xs font-medium text-[#a3a3a3] mb-2">Add new category</p>
            <div className="flex flex-col gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name (e.g. Internal, Client)"
                maxLength={100}
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                maxLength={500}
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || isMutating}
                className="bg-[#E0B954] hover:bg-[#C79E3B] text-black self-end"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add category
              </Button>
            </div>
          </div>

          {/* List of existing categories */}
          <div className="max-h-[400px] overflow-y-auto -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#737373] py-6 justify-center">
                <Spinner size="xs" tone="muted" />
                Loading categories…
              </div>
            ) : categories.length === 0 ? (
              <Empty>
                <EmptyDescription>No categories yet. Add one above.</EmptyDescription>
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {categories.map((cat) => {
                  const isEditing = editingId === cat.id;
                  return (
                    <li
                      key={cat.id}
                      className="border border-[rgba(255,255,255,0.05)] rounded-lg p-3 bg-[rgba(255,255,255,0.02)]"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={100}
                            className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
                          />
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description (optional)"
                            maxLength={500}
                            className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
                          />
                          <div className="flex gap-2 self-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={isMutating}
                              className="bg-transparent border-[rgba(255,255,255,0.08)] text-white hover:bg-[#E0B954] hover:border-[#E0B954] hover:text-black"
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleEditSave(cat.id)}
                              disabled={!editName.trim() || isMutating}
                              className="bg-[#E0B954] hover:bg-[#C79E3B] text-black"
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{cat.name}</p>
                            {cat.description && (
                              <p className="text-xs text-[#737373] mt-0.5 truncate">
                                {cat.description}
                              </p>
                            )}
                            <p className="text-[11px] text-[#525252] mt-1">
                              {cat.project_count} project{cat.project_count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(cat)}
                              disabled={isMutating}
                              className="text-[#a3a3a3] hover:text-white h-7 w-7 p-0"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDeleteId(cat.id)}
                              disabled={isMutating}
                              className="text-[#FCA5A5] hover:text-[#FCA5A5] hover:bg-[#EF4444]/10 h-7 w-7 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — rendered alongside the manager dialog so its
          state survives a re-render. The AlertDialog handles its own overlay,
          so this works inside or alongside the parent Dialog. */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a3a3a3]">
              {pendingDelete ? (
                <>
                  Delete category <span className="text-white">"{pendingDelete.name}"</span>?
                  {pendingDelete.project_count > 0 && (
                    <>
                      {' '}
                      Its {pendingDelete.project_count} project
                      {pendingDelete.project_count === 1 ? '' : 's'} will become uncategorized.
                    </>
                  )}{' '}
                  This action can't be undone.
                </>
              ) : (
                'This action cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,0.08)] text-white hover:bg-[#E0B954] hover:border-[#E0B954] hover:text-black">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDeleteId !== null) {
                  await onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
              className="bg-[#EF4444] text-white hover:bg-[#DC2626]"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CategoryManagerModal;
