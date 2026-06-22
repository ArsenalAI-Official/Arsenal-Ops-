import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import TicketContributors from '@/components/TicketContributors';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import type { WorkItem, ProjectLite } from './types';
import type { SprintResponse } from '@/client';
import type { ProjectDeveloperEntry } from '@/client';
import { AddSubtaskModal } from './AddSubtaskModal';
import { useWorkItemPanel } from './hooks/useWorkItemPanel';
import { WorkItemPanelHeader } from './components/WorkItemPanelHeader';
import { WorkItemFullEditForm } from './components/WorkItemFullEditForm';
import { WorkItemCompactEditForm } from './components/WorkItemCompactEditForm';
import { WorkItemViewMode } from './components/WorkItemViewMode';
import { WorkItemFullHierarchy } from './components/WorkItemFullHierarchy';
import { WorkItemCompactHierarchy } from './components/WorkItemCompactHierarchy';
import { hasCompactHierarchy } from './lib/renderContent';
import { WorkItemSprintActions } from './components/WorkItemSprintActions';
import CommentThread from '@/components/CommentThread';
import { ExternalLink, Pencil } from 'lucide-react';

// ─── Prop types ──────────────────────────────────────────────────────────────

interface WorkItemPanelCommon {
  item: WorkItem;
  token: string;
  currentUserId: number | null;
  onClose: () => void;
}

export interface WorkItemPanelFullProps extends WorkItemPanelCommon {
  variant: 'full';
  workItems: WorkItem[];
  sprints: SprintResponse[];
  project: ProjectLite | null;
  projectId: string | undefined;
  navigate: (path: string) => void;
  isSavingEdit: boolean;
  onSaveEdit: (edits: Partial<WorkItem>) => void;
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onLogHours: (item: WorkItem, hours: number) => void;
  isLoggingHours: boolean;
  onDeleteItem: (itemId: string) => void;
  onMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
}

export interface WorkItemPanelCompactProps extends WorkItemPanelCommon {
  variant: 'compact';
  onItemChanged: (updated: WorkItem) => void;
  onOpenInBoard: (projectId: number, taskId: string) => void;
}

export type WorkItemPanelProps = WorkItemPanelFullProps | WorkItemPanelCompactProps;

// ─── Component ───────────────────────────────────────────────────────────────

const WorkItemPanel = (props: WorkItemPanelProps) => {
  const { item, token, currentUserId, onClose } = props;
  const { can } = useAuth();
  // Write actions (edit + delete) require the same capability the backend
  // enforces on PUT/DELETE /api/workitems/{id}. Without it the buttons are
  // hidden so users don't see actions that would 403 on click.
  const canWriteTracker = can('project.tracker_write');

  // ─── Edit form state ───────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
  const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);
  // Compact variant: project developers fetched on edit start
  const [compactEditDevs, setCompactEditDevs] = useState<ProjectDeveloperEntry[]>([]);

  const [showAddSubtaskModal, setShowAddSubtaskModal] = useState(false);

  // Comment input + @mention state is owned by the shared <CommentThread>.

  // ─── Log hours ref (replaces getElementById anti-pattern) ─────────────────
  const logHoursRef = useRef<HTMLInputElement>(null);

  // ─── Data layer (queries + mutations + hierarchy memos) ────────────────────
  const {
    itemDetail,
    comments,
    allDevelopers,
    isAssignee,
    fullWorkItems,
    parentExcludeIds,
    epicExcludeIds,
    selectedItemHasChildren,
    subtasksOfCurrent,
    saveEditCompact,
    statusChangeCompact,
    logHoursCompact,
    createSubtask,
    submitComment,
  } = useWorkItemPanel({
    props,
    editForm,
    setIsEditing,
    setEditForm,
    setShowAddSubtaskModal,
    logHoursRef,
  });

  // ─── Action wrappers (route to full callbacks or compact mutations) ─────────
  const isSavingEdit = props.variant === 'full' ? props.isSavingEdit : saveEditCompact.isPending;
  const isLoggingHours =
    props.variant === 'full' ? props.isLoggingHours : logHoursCompact.isPending;

  const handleSaveEdit = () => {
    if (isSavingEdit) return;
    if (props.variant === 'full') {
      props.onSaveEdit(editForm);
      setIsEditing(false);
      setEditForm({});
    } else {
      saveEditCompact.mutate(editForm);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (props.variant === 'full') {
      props.onStatusChange(item, newStatus);
    } else {
      statusChangeCompact.mutate(newStatus);
    }
  };

  const handleLogHours = () => {
    const hours = parseInt(logHoursRef.current?.value || '0');
    if (hours <= 0) return;
    if (props.variant === 'full') {
      props.onLogHours(item, hours);
      if (logHoursRef.current) logHoursRef.current.value = '';
    } else {
      logHoursCompact.mutate(hours);
    }
  };

  // "Assign to me" quick-action — visible in view mode when the ticket has
  // no assignee, is not an epic (epics aggregate; never directly assigned),
  // and the current user is mapped to a Developer row on this project
  // (`currentUserId` is the resolved Developer.id — the prop is misnamed but
  // semantically that's what it carries). Routes through the same save path
  // as the inline Edit form so cache, toast, and invalidation are consistent.
  //
  // The "unassigned" predicate matches the display logic right below: we
  // base it on `item.assignee` (the name string) — the same field the avatar
  // + label fall back on — because `assignee_id` and `assignee` can diverge
  // in optimistic cache patches (e.g. status drag-and-drop) where only the
  // name string is updated.
  const isUnassigned = !item.assignee || item.assignee === 'Unassigned';
  const canAssignToMe =
    isUnassigned && item.type !== 'epic' && currentUserId != null && !isSavingEdit;
  const handleAssignToMe = () => {
    if (!canAssignToMe || currentUserId == null) return;
    const edits = { assignee_id: currentUserId } as Partial<WorkItem>;
    if (props.variant === 'full') {
      props.onSaveEdit(edits);
    } else {
      saveEditCompact.mutate(edits);
    }
  };

  // ─── Edit form start ───────────────────────────────────────────────────────
  const startEditing = async () => {
    if (props.variant === 'compact') {
      // Fetch project developers for the assignee dropdown
      try {
        const projectId = (item as WorkItem & { project_id?: number }).project_id;
        if (projectId) {
          const data = await apiFetch(`/api/projects/${projectId}`);
          setCompactEditDevs((data as { developers?: ProjectDeveloperEntry[] }).developers ?? []);
        }
      } catch {
        /* proceed without project devs */
      }
    }
    setEditForm({ ...itemDetail });
    setIsEditing(true);
  };

  // Disable Edit affordances when the ticket is done and not currently
  // being edited. Mirrors the server-side "frozen until re-opened" rule.
  const isDoneAndNotEditing = item.status === 'done' && !isEditing;

  // Shared by the resolve-one + bulk-unblock mutations below.
  const queryClient = useQueryClient();

  // ── Resolve-a-single-blocker-comment mutation ─────────────────────────────
  // Fires when the user clicks the inline "Resolve" pill on one blocker
  // comment. Backend: PATCH /api/comments/{id}/resolve?is_resolved=true.
  // Invalidations match the bulk unblock — board card's red badge and the
  // ticket's comments cache both need to refresh.
  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: number) =>
      apiFetch(`/api/comments/${commentId}/resolve?is_resolved=true`, { method: 'PATCH' }),
    onSuccess: () => toast.success('Blocker comment resolved'),
    onError: () => toast.error('Failed to resolve comment'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
  });

  // ── Unblock mutation (bulk-resolve every unresolved blocker comment) ──────
  // Backend gates on `project.tracker_write`. Invalidates the board list
  // (so the kanban card's red Blocked badge clears) and this item's
  // comments cache (so the resolved-pill shows up immediately). Also
  // invalidates myTasks per CONVENTIONS.md cross-cutting rule.
  const unblockMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ resolved_count: number }>(`/api/workitems/${item.id}/unblock`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      if (data.resolved_count > 0) {
        toast.success(
          `Unblocked — resolved ${data.resolved_count} blocker comment${data.resolved_count === 1 ? '' : 's'}`,
        );
      } else {
        // Idempotent success when ticket wasn't actually blocked anymore
        // (e.g. someone resolved the last blocker from another tab).
        toast.success('Ticket was already unblocked');
      }
    },
    onError: () => toast.error('Failed to unblock ticket'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
  });

  // Hierarchy block fed into WorkItemViewMode. Full variant shows the
  // epic/parent/subtask tree; compact shows only the immediate ref. `null`
  // when there's nothing meaningful to show (e.g. a top-level epic in
  // compact mode).
  const linkedItems =
    props.variant === 'full' ? (
      <WorkItemFullHierarchy
        item={item}
        fullWorkItems={fullWorkItems}
        subtasksOfCurrent={subtasksOfCurrent}
        projectId={props.projectId}
        navigate={props.navigate}
        onAddSubtask={() => setShowAddSubtaskModal(true)}
      />
    ) : hasCompactHierarchy(item) ? (
      <WorkItemCompactHierarchy item={item} onOpenInBoard={props.onOpenInBoard} />
    ) : null;

  // Comments block — shared CommentThread; `full` variant exposes
  // blocker / business-review chips.
  const commentsNode = (
    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
        Activity &amp; Comments
      </div>
      <CommentThread
        comments={comments}
        allDevelopers={allDevelopers}
        isPosting={submitComment.isPending}
        onSubmit={(content, type) => submitComment.mutate({ content, type })}
        variant="full"
        // Per-comment Resolve gated on the same write cap as bulk Unblock.
        // Hidden entirely for read-only viewers — they won't see the pill.
        onResolveComment={
          canWriteTracker ? (commentId) => resolveCommentMutation.mutate(commentId) : undefined
        }
        resolvingCommentId={
          resolveCommentMutation.isPending ? (resolveCommentMutation.variables ?? null) : null
        }
      />
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className={`fixed right-0 top-0 bottom-0 w-full ${props.variant === 'full' ? 'max-w-xl animate-in slide-in-from-right duration-300' : 'max-w-lg'} bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50`}
      >
        {/* Header */}
        <WorkItemPanelHeader
          item={item}
          variant={props.variant}
          canWriteTracker={canWriteTracker}
          isEditing={isEditing}
          isDoneAndNotEditing={isDoneAndNotEditing}
          onToggleEdit={() => {
            if (isEditing) {
              setIsEditing(false);
              setEditForm({});
            } else {
              startEditing();
            }
          }}
          onDelete={() => props.variant === 'full' && props.onDeleteItem(item.id)}
          onClose={onClose}
          isUnblocking={unblockMutation.isPending}
          onUnblock={() => unblockMutation.mutate()}
        />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isEditing ? (
            props.variant === 'full' ? (
              <WorkItemFullEditForm
                item={item}
                itemDetail={itemDetail}
                editForm={editForm}
                setEditForm={setEditForm}
                developers={props.project?.developers}
                fullWorkItems={fullWorkItems}
                epicExcludeIds={epicExcludeIds}
                parentExcludeIds={parentExcludeIds}
                selectedItemHasChildren={selectedItemHasChildren}
                showCalendarEditForm={showCalendarEditForm}
                setShowCalendarEditForm={setShowCalendarEditForm}
                isSavingEdit={isSavingEdit}
                onSaveEdit={handleSaveEdit}
              />
            ) : (
              <WorkItemCompactEditForm
                item={item}
                editForm={editForm}
                setEditForm={setEditForm}
                compactEditDevs={compactEditDevs}
                showCalendarEditForm={showCalendarEditForm}
                setShowCalendarEditForm={setShowCalendarEditForm}
                isSavingEdit={isSavingEdit}
                onSaveEdit={handleSaveEdit}
                onCancel={() => {
                  setIsEditing(false);
                  setEditForm({});
                  setCompactEditDevs([]);
                }}
              />
            )
          ) : (
            <WorkItemViewMode
              item={item}
              itemDetail={itemDetail}
              variant={props.variant}
              isAssignee={isAssignee}
              canAssignToMe={canAssignToMe}
              onAssignToMe={handleAssignToMe}
              isSavingEdit={isSavingEdit}
              onStatusChange={handleStatusChange}
              isLoggingHours={isLoggingHours}
              onLogHours={handleLogHours}
              logHoursRef={logHoursRef}
              linkedItems={linkedItems}
              contributors={
                props.variant === 'full' ? (
                  <TicketContributors workItemId={item.id} token={token || ''} />
                ) : null
              }
              sprintActions={
                props.variant === 'full' ? (
                  <WorkItemSprintActions
                    item={item}
                    sprints={props.sprints}
                    onMoveToSprint={props.onMoveToSprint}
                    getNextSprint={props.getNextSprint}
                  />
                ) : null
              }
              comments={commentsNode}
            />
          )}
        </div>

        {/* Footer (compact only: Edit + Open ticket). Edit is hidden when the
            user lacks project.tracker_write — Open ticket stays so the user
            can still navigate to the board view. */}
        {props.variant === 'compact' && !isEditing && (
          <div className="flex-shrink-0 p-4 border-t border-[rgba(255,255,255,0.05)] flex gap-3">
            {canWriteTracker && (
              <button
                onClick={startEditing}
                disabled={isDoneAndNotEditing}
                title={isDoneAndNotEditing ? 'Re-open this ticket before editing.' : undefined}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-white font-semibold text-sm hover:bg-[rgba(255,255,255,0.08)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
            )}
            <button
              onClick={() =>
                props.variant === 'compact' &&
                props.onOpenInBoard(
                  (item as WorkItem & { project_id?: number }).project_id ?? 0,
                  item.id,
                )
              }
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="w-4 h-4" />
              Open ticket
            </button>
          </div>
        )}
      </div>

      {showAddSubtaskModal && (
        <AddSubtaskModal
          developers={props.variant === 'full' ? (props.project?.developers ?? []) : []}
          isPending={createSubtask.isPending}
          onClose={() => setShowAddSubtaskModal(false)}
          onSubmit={(form) => createSubtask.mutate(form)}
        />
      )}
    </>
  );
};

export default WorkItemPanel;
