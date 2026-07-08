import { lazy, Suspense } from 'react';
import type { SprintResponse, DeveloperResponse } from '@/client';
import type { WorkItem, ProjectLite } from '@/components/WorkItemPanel';

const ItemDetailDrawer = lazy(() => import('../ItemDetailDrawer'));

// A popped-out ticket: which item + where it sits. Array order is the z-order —
// the last entry renders on top (see `zIndex` below).
export interface FloatingEntry {
  id: string;
  x: number;
  y: number;
}

interface FloatingTicketsProps {
  entries: FloatingEntry[];
  // Shared board context (same values BoardModals passes to the docked drawer).
  workItems: WorkItem[];
  sprints: SprintResponse[];
  project: ProjectLite | null;
  allDevelopers: DeveloperResponse[];
  id: string | undefined;
  token: string;
  navigate: (path: string) => void;
  parseLocalDate: (s: string | undefined) => Date | undefined;
  isSavingEdit: boolean;
  isLoggingHours: boolean;
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onLogHours: (item: WorkItem, hours: number) => void;
  onMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
  // Id-scoped edit handlers so each window mutates ITS OWN ticket (not the
  // docked selection) — the board binds these to the specific field mutations.
  onSaveEditFor: (itemId: string, edits: Partial<WorkItem>) => void;
  onPatchFieldFor: (itemId: string, edits: Partial<WorkItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onClose: (itemId: string) => void;
  onFocus: (itemId: string) => void;
  /** Re-docks the window back into the side dock. */
  onDock: (itemId: string) => void;
}

export const FloatingTickets = ({
  entries,
  workItems,
  sprints,
  project,
  allDevelopers,
  id,
  token,
  navigate,
  parseLocalDate,
  isSavingEdit,
  isLoggingHours,
  onStatusChange,
  onLogHours,
  onMoveToSprint,
  getNextSprint,
  onSaveEditFor,
  onPatchFieldFor,
  onDeleteItem,
  onClose,
  onFocus,
  onDock,
}: FloatingTicketsProps) => {
  if (entries.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {entries.map((entry, idx) => {
        // The item must be present in the current board list to render.
        const item = workItems.find((w) => w.id === entry.id);
        if (!item) return null;
        return (
          <ItemDetailDrawer
            key={entry.id}
            selectedItem={item}
            workItems={workItems}
            sprints={sprints}
            project={project}
            allDevelopers={allDevelopers}
            id={id}
            token={token}
            navigate={navigate}
            parseLocalDate={parseLocalDate}
            isSavingEdit={isSavingEdit}
            isLoggingHours={isLoggingHours}
            onStatusChange={onStatusChange}
            onLogHours={onLogHours}
            onMoveToSprint={onMoveToSprint}
            getNextSprint={getNextSprint}
            onSaveEdit={(edits) => onSaveEditFor(entry.id, edits)}
            onPatchField={(edits) => onPatchFieldFor(entry.id, edits)}
            onDeleteItem={(itemId) => {
              onClose(entry.id);
              onDeleteItem(itemId);
            }}
            onClose={() => onClose(entry.id)}
            onDock={() => onDock(entry.id)}
            presentation="floating"
            zIndex={50 + idx}
            onFocus={() => onFocus(entry.id)}
            initialPosition={{ x: entry.x, y: entry.y }}
          />
        );
      })}
    </Suspense>
  );
};
