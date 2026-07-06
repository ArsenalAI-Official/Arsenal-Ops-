import { useMemo } from 'react';
import type { SprintResponse, DeveloperResponse } from '@/client';
import { WorkItemPanel } from '@/components/WorkItemPanel';
import type { WorkItem, ProjectLite } from '@/components/WorkItemPanel';
import { useAuth } from '@/contexts/AuthContext';

export interface ItemDetailDrawerProps {
  selectedItem: WorkItem;
  workItems: WorkItem[];
  sprints: SprintResponse[];
  project: ProjectLite | null;
  // allDevelopers still accepted for backward compat with ProjectBoard call site;
  // WorkItemPanel fetches developers internally via ['developers'] query.
  allDevelopers: DeveloperResponse[];
  id: string | undefined;
  token: string;
  navigate: (path: string) => void;
  parseLocalDate: (s: string | undefined) => Date | undefined;
  isSavingEdit: boolean;
  onSaveEdit: (edits: Partial<WorkItem>) => void;
  onPatchField: (edits: Partial<WorkItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onLogHours: (item: WorkItem, hours: number) => void;
  isLoggingHours: boolean;
  onMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  // onSubmitComment kept for backward compat; comments are now handled internally.
  onSubmitComment?: (content: string, type?: 'comment' | 'blocker' | 'business_review') => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
  // ── Floating-window support (board multi-ticket view) ──────────────────────
  /** 'docked' (default) or 'floating'. */
  presentation?: 'docked' | 'floating';
  /** Floating: stacking order, bring-to-front, initial position. */
  zIndex?: number;
  onFocus?: () => void;
  initialPosition?: { x: number; y: number };
  /** Docked: shows the header pop-out button. */
  onPopOut?: () => void;
  /** Floating: re-docks the window back into the side dock. */
  onDock?: () => void;
  /** Overrides the default close behavior (docked navigates to the board;
   *  floating windows pass a remove-from-list handler). */
  onClose?: () => void;
}

const ItemDetailDrawer = ({
  selectedItem,
  workItems,
  sprints,
  project,
  allDevelopers,
  id,
  token,
  navigate,
  isSavingEdit,
  onSaveEdit,
  onPatchField,
  onDeleteItem,
  onStatusChange,
  onLogHours,
  isLoggingHours,
  onMoveToSprint,
  getNextSprint,
  presentation,
  zIndex,
  onFocus,
  initialPosition,
  onPopOut,
  onDock,
  onClose,
}: ItemDetailDrawerProps) => {
  const { user } = useAuth();

  // Resolve current developer ID for isAssignee check inside WorkItemPanel.
  // allDevelopers is the project-scoped list; look up by auth email.
  const currentUserId = useMemo(
    () => allDevelopers.find((d) => d.email === user?.email)?.id ?? null,
    [allDevelopers, user?.email],
  );

  return (
    <WorkItemPanel
      variant="full"
      item={selectedItem}
      workItems={workItems}
      sprints={sprints}
      project={project}
      projectId={id}
      token={token}
      currentUserId={currentUserId}
      isSavingEdit={isSavingEdit}
      onSaveEdit={onSaveEdit}
      onPatchField={onPatchField}
      onStatusChange={onStatusChange}
      onLogHours={onLogHours}
      isLoggingHours={isLoggingHours}
      onDeleteItem={onDeleteItem}
      onMoveToSprint={onMoveToSprint}
      getNextSprint={getNextSprint}
      navigate={navigate}
      onClose={onClose ?? (() => navigate(`/project/${id}/board`))}
      presentation={presentation}
      zIndex={zIndex}
      onFocus={onFocus}
      initialPosition={initialPosition}
      onPopOut={onPopOut}
      onDock={onDock}
    />
  );
};

export default ItemDetailDrawer;
