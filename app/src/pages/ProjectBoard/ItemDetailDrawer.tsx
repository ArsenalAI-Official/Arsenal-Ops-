import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { WorkItemPanel } from '@/components/WorkItemPanel';
import type { WorkItem, ProjectLite } from '@/components/WorkItemPanel';
import type { SprintResponse, DeveloperResponse } from '@/client';

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
  onDeleteItem: (itemId: string) => void;
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onLogHours: (item: WorkItem, hours: number) => void;
  isLoggingHours: boolean;
  onMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  // onSubmitComment kept for backward compat; comments are now handled internally.
  onSubmitComment?: (content: string, type?: 'comment' | 'blocker' | 'business_review') => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
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
  onDeleteItem,
  onStatusChange,
  onLogHours,
  isLoggingHours,
  onMoveToSprint,
  getNextSprint,
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
      onStatusChange={onStatusChange}
      onLogHours={onLogHours}
      isLoggingHours={isLoggingHours}
      onDeleteItem={onDeleteItem}
      onMoveToSprint={onMoveToSprint}
      getNextSprint={getNextSprint}
      navigate={navigate}
      onClose={() => navigate(`/project/${id}/board`)}
    />
  );
};

export default ItemDetailDrawer;
