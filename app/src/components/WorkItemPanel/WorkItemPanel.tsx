import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import type { SprintResponse } from '@/client';
import type { ProjectDeveloperEntry } from '@/client';
import CommentThread from '@/components/CommentThread';
import TicketContributors from '@/components/TicketContributors';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { AddSubtaskModal } from './AddSubtaskModal';
import type { RailDeveloper } from './components/rail/PropertiesRail';
import { WorkItemCompactEditForm } from './components/WorkItemCompactEditForm';
import { WorkItemCompactHierarchy } from './components/WorkItemCompactHierarchy';
import { WorkItemFullEditForm } from './components/WorkItemFullEditForm';
import { WorkItemFullHierarchy } from './components/WorkItemFullHierarchy';
import { WorkItemPanelHeader } from './components/WorkItemPanelHeader';
import { WorkItemSprintActions } from './components/WorkItemSprintActions';
import { WorkItemTwoPaneView } from './components/WorkItemTwoPaneView';
import { useFloatingPosition } from './hooks/useFloatingPosition';
import { useFloatingSize } from './hooks/useFloatingSize';
import { usePanelWidth } from './hooks/usePanelWidth';
import { useRailCollapsed } from './hooks/useRailCollapsed';
import { useWorkItemPanel } from './hooks/useWorkItemPanel';
import { hasCompactHierarchy } from './lib/renderContent';
import type { WorkItem, ProjectLite } from './types';

// ─── Prop types ──────────────────────────────────────────────────────────────

interface WorkItemPanelCommon {
  item: WorkItem;
  token: string;
  currentUserId: number | null;
  onClose: () => void;
  /** 'docked' (default): modal right-anchored slide-over. 'floating': a movable,
   *  non-modal window (board only — for viewing multiple tickets at once). */
  presentation?: 'docked' | 'floating';
  /** Docked only: detaches this ticket into a floating window. Shows the header
   *  pop-out button when provided. */
  onPopOut?: () => void;
  /** Floating only: re-docks this window back into the right-side dock. */
  onDock?: () => void;
  /** Floating only: stacking order + bring-to-front on interaction, and the
   *  initial on-screen position. */
  zIndex?: number;
  onFocus?: () => void;
  initialPosition?: { x: number; y: number };
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
  /** Inline per-field patch (Properties rail). Optimistic + rollback on the
   *  board cache; status is NOT sent here (it routes through onStatusChange). */
  onPatchField: (edits: Partial<WorkItem>) => void;
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
  const { item, token, onClose } = props;
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
    patchFieldCompact,
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

  // Developers for the rail's inline Assignee dropdown: the project roster for
  // the full variant, the full developer list otherwise. Mapped to {id,name}.
  const projectDevs = props.variant === 'full' ? props.project?.developers : undefined;
  const railDevelopers: RailDeveloper[] = useMemo(
    () => (projectDevs ?? allDevelopers).map((d) => ({ id: d.id, name: d.name })),
    [projectDevs, allDevelopers],
  );

  // Rail collapse state (persisted per-user); driven by the header layout-toggle.
  const { collapsed: railCollapsed, toggle: toggleRail } = useRailCollapsed();

  // Drag-to-resize the panel width (persisted per-variant). Defaults match the
  // previous fixed max-widths (max-w-4xl / max-w-3xl).
  const { width, startResize, onHandleKeyDown } = usePanelWidth({
    storageKey: `workItemPanel.width.${props.variant}`,
    defaultWidth: props.variant === 'full' ? 896 : 768,
    min: 480,
    max: 1600,
  });

  // Floating presentation: a movable, non-modal window (board only). Docked is
  // the default modal slide-over.
  const isFloating = props.presentation === 'floating';
  const { pos, startDrag } = useFloatingPosition(props.initialPosition ?? { x: 140, y: 90 });
  // Floating windows resize from a bottom-right corner grip (independent w/h).
  const { size: floatSize, startResize: startFloatResize } = useFloatingSize(
    props.variant === 'full' ? 900 : 760,
    700,
  );

  // Single edit-in-place seam for the Properties rail. Status routes through the
  // DnD-shared optimistic mutation (handleStatusChange); every other field goes
  // through the field-patch path — the parent callback for the full variant, the
  // internal compact mutation otherwise. This is where the "Assign to me" quick
  // action used to live; the rail's Assignee dropdown replaces it.
  const handlePatchField = (edits: Partial<WorkItem>) => {
    if ('status' in edits && edits.status) {
      handleStatusChange(edits.status);
      return;
    }
    if (props.variant === 'full') {
      props.onPatchField(edits);
    } else {
      patchFieldCompact.mutate(edits);
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
      <div className="text-xs text-progress mb-3 font-semibold uppercase tracking-wider">
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

  // ── Chrome pieces shared by the docked + floating presentations ───────────
  const cardInner = (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#111114] shadow-xl shadow-black/40">
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
        // Rail toggle is only meaningful in the two-pane view (not edit mode).
        railCollapsed={railCollapsed}
        onToggleRail={isEditing ? undefined : toggleRail}
        // Pop-out: docked full-variant view only. Dock-back + drag: floating.
        onPopOut={!isFloating && !isEditing ? props.onPopOut : undefined}
        onDock={isFloating ? props.onDock : undefined}
        onTitleBarPointerDown={isFloating ? startDrag : undefined}
      />

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isEditing ? (
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {props.variant === 'full' ? (
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
            )}
          </div>
        ) : (
          <WorkItemTwoPaneView
            item={item}
            itemDetail={itemDetail}
            railDevelopers={railDevelopers}
            canWrite={canWriteTracker}
            isFrozen={isDoneAndNotEditing}
            onPatchField={handlePatchField}
            collapsed={railCollapsed}
            variant={props.variant}
            isAssignee={isAssignee}
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
  );

  const dockedResizeHandle = (
    <button
      type="button"
      aria-label="Resize panel"
      onPointerDown={startResize}
      onKeyDown={onHandleKeyDown}
      className="group absolute top-0 bottom-0 left-0 z-10 flex w-2 -translate-x-1/2 cursor-col-resize items-center justify-center focus:outline-none"
    >
      <div className="h-full w-px bg-[rgba(255,255,255,0.08)] transition-colors group-hover:bg-[#E0B954] group-focus:bg-[#E0B954]" />
    </button>
  );

  const floatingGrip = (
    <button
      type="button"
      aria-label="Resize window"
      onPointerDown={startFloatResize}
      className="absolute right-0.5 bottom-0.5 z-20 flex h-4 w-4 cursor-nwse-resize items-end justify-end text-[#555] hover:text-[#E0B954] focus:outline-none"
    >
      <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none" stroke="currentColor">
        <path d="M9 3 L3 9 M9 6.5 L6.5 9" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );

  const addSubtaskModalNode = showAddSubtaskModal && (
    <AddSubtaskModal
      developers={props.variant === 'full' ? (props.project?.developers ?? []) : []}
      isPending={createSubtask.isPending}
      onClose={() => setShowAddSubtaskModal(false)}
      onSubmit={(form) => createSubtask.mutate(form)}
    />
  );

  // Floating: a movable, non-modal window (board multi-ticket view). No scrim,
  // no focus trap — the board stays interactive and windows coexist.
  if (isFloating) {
    return (
      <>
        <div
          style={{
            left: pos.x,
            top: pos.y,
            width: floatSize.w,
            height: floatSize.h,
            zIndex: props.zIndex ?? 50,
          }}
          onPointerDown={props.onFocus}
          className="fixed flex animate-in fade-in zoom-in-95 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0a0a0a] p-1.5 shadow-2xl shadow-black/70 duration-200 ease-out"
        >
          {cardInner}
          {floatingGrip}
        </div>
        {addSubtaskModalNode}
      </>
    );
  }

  // Docked: modal right-anchored slide-over on Radix Dialog — focus trap,
  // Escape, focus-restore-to-trigger, aria-modal, and scroll-lock come for free.
  // AddSubtaskModal renders INSIDE Content so it stays within the focus trap
  // (it's a plain fixed overlay, not a portal). Overlay-click / Escape close via
  // onOpenChange → onClose.
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 animate-in fade-in duration-300" />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ width }}
          className="fixed right-0 top-0 bottom-0 z-50 flex max-w-[100vw] animate-in fade-in slide-in-from-right-8 border-l border-[rgba(255,255,255,0.06)] bg-[#0a0a0a] p-3 shadow-2xl shadow-black/60 duration-500 ease-out focus:outline-none"
        >
          <Dialog.Title className="sr-only">
            {item.key}: {item.title}
          </Dialog.Title>
          {cardInner}
          {dockedResizeHandle}
          {addSubtaskModalNode}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default WorkItemPanel;
