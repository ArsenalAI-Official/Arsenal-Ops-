import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LayoutGrid, List, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
// Canonical single source of truth for type/status/priority config — do NOT
// re-fork these locally (they had drifted across ~7 copies before consolidation).
import {
  TYPE_CONFIG,
  STATUS_CONFIG,
  PRIORITY_STYLE as PRIORITY_COLORS,
} from '@/lib/workItemConfig';
import type { WorkItem } from '@/types/workItems';
import type { SprintResponse, ProjectArchitectureResponse } from '@/client';
import BoardView from './views/BoardView';
import ListView from './views/ListView';
import EpicView from './views/EpicView';
import BoardSkeleton from './components/BoardSkeleton';
import BoardHeader from './components/BoardHeader';
import BoardToolbar from './components/BoardToolbar';
import BoardFilterMenu from './components/BoardFilterMenu';
// The modal/panel render cluster (detail drawer + the four lazy modals + the
// eagerly-imported EditSprint/Complete/Delete confirmations + Reviewer panel +
// Architecture editor) lives in BoardModals. The lazy boundaries (R5) and the
// EditSprintModal static import (R4) moved there intact.
import BoardModals from './components/BoardModals';
import { parseLocalDate } from './lib/listGrouping';
import { getNextSprint as getNextSprintPure } from './lib/sprintNav';
import { useBoardData } from './hooks/useBoardData';
import { useBoardInvalidations } from './hooks/useBoardInvalidations';
import { useWorkItemMutations } from './hooks/useWorkItemMutations';
import { useBoardDnd } from './hooks/useBoardDnd';
import { useSprintMutations } from './hooks/useSprintMutations';
import { useCommentMutation } from './hooks/useCommentMutation';
import { useBoardFilters } from './hooks/useBoardFilters';
import { useListSort } from './hooks/useListSort';
import { useListGrouping } from './hooks/useListGrouping';

const ProjectBoard = () => {
  const { id, ticketId } = useParams<{ id: string; ticketId?: string }>();
  const navigate = useNavigate();
  const { token, user, can } = useAuth(); // token kept for legacy child components (TimeEntriesTable, TicketContributors, ReviewerView)
  // Gate any UI that mutates a work item — kanban drag (PUT for status),
  // StatusDotMenu (PUT for status), Edit/Delete in the side panel, and the
  // "Assign to me" pill. Backend mirrors this with require_capability on
  // PUT /api/workitems/{id} and DELETE /api/workitems/{id}.
  const canWriteTracker = can('project.tracker_write');
  const queryClient = useQueryClient();
  // Themed confirm dialog (replaces the native window.confirm for destructive
  // actions; matches the rest of the app post-#49). `confirmDialog` is rendered
  // once below; `confirm` is threaded into the mutation handlers that need it.
  const { confirm, confirmDialog } = useConfirm();
  const [showReviewer, setShowReviewer] = useState(false);
  // Defense-in-depth gate for the slide-in Reviewer panel. The Reviewer
  // entry takes the user into a queue where they can mark items as done
  // and write reviews — all backed by mutations that require
  // `project.tracker_write`. Gating both the button (below) AND the
  // panel render (further down) on this derived value means a mid-session
  // cap revocation immediately closes the panel even though
  // `showReviewer` is still true in state. Backend independently gates
  // every Reviewer write via `require_capability("project.tracker_write")`.
  const effectiveShowReviewer = showReviewer && canWriteTracker;
  // isEditing + editForm + drawer comment state moved into ItemDetailDrawer
  // (PR 9). The drawer keys on selectedItem.id so state resets cleanly when
  // the user navigates to a different ticket.
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormType, setCreateFormType] = useState<string>('user_story');
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'epic'>('board');

  // Shared list-view sort state + comparator (handleListSort cycles asc → desc
  // → off). The sortable header cell now lives in `views/components/
  // ListSortHeader`, rendered inside ListView/EpicView.
  const { listSortKey, listSortDir, handleListSort, listItemComparator } = useListSort();

  const VIEW_TABS = [
    { mode: 'board' as const, icon: LayoutGrid, label: 'Board', tabId: 'tab-board' },
    { mode: 'list' as const, icon: List, label: 'List', tabId: 'tab-list' },
    { mode: 'epic' as const, icon: Target, label: 'Epic', tabId: 'tab-epic' },
  ];

  const handleViewTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const modes = ['board', 'list', 'epic'] as const;
      const currentIndex = modes.indexOf(viewMode);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewMode(modes[(currentIndex + 1) % modes.length]);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewMode(modes[(currentIndex - 1 + modes.length) % modes.length]);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setViewMode('board');
      } else if (e.key === 'End') {
        e.preventDefault();
        setViewMode('epic');
      }
    },
    [viewMode],
  );

  // AI Planning flow — only the top-level open + architectures (shared with
  // ArchitectureEditor wrapper) stay at the parent. Multi-step + PRD/Roadmap
  // state lives inside AIPlanningModal.
  const [showAIModal, setShowAIModal] = useState(false);
  const [architectures, setArchitectures] = useState<ProjectArchitectureResponse[]>([]);
  const [editingArchitecture, setEditingArchitecture] =
    useState<ProjectArchitectureResponse | null>(null);

  // Sprint and timeline states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState<number | 'all' | 'unassigned'>('all');
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCompletedSprints, setShowCompletedSprints] = useState(false);
  const [editingSprint, setEditingSprint] = useState<SprintResponse | null>(null);
  const [deletingSprintId, setDeletingSprintId] = useState<number | null>(null);
  const [completingSprintId, setCompletingSprintId] = useState<number | null>(null);

  // All calendar popover states have moved into their owning modals/drawer.
  // Comment input state (newComment/showMentions/mentionFilter) moved into
  // ItemDetailDrawer (PR 9).

  // createForm / tagInput / showCalendarCreateForm moved into CreateItemModal
  // (PR 7) — form state is local to the modal; parent owns only visibility
  // + the create-item mutation.

  // ── react-query: project, workItems, sprints, developers, comments ────────
  // The board's read layer (4 queries + the memo-stable `workItemFilters` that
  // anchors the work-items query key + the `data ?? []` stabilization memos +
  // hover-prefetch) lives in `useBoardData`, called ONCE here as the sole query
  // owner (CONVENTIONS rule 1). `workItemFilters` is threaded back into the
  // inline mutations so their optimistic cache reads/writes/rollback key off the
  // SAME memoized reference (`['workItems', workItemFilters, 'board']`).
  const {
    project,
    isLoading,
    workItems,
    sprints,
    allDevelopers,
    workItemFilters,
    prefetchComments,
  } = useBoardData(id);

  // Selected ticket — derived from URL param + workItems cache (no extra fetch)
  const selectedItem = ticketId ? (workItems.find((item) => item.id === ticketId) ?? null) : null;

  // commentsQuery moved to ItemDetailDrawer (PR 9). Documented exception to
  // CONVENTIONS rule "queries stay at parent": this query is keyed on the
  // currently-open ticket and is only consumed inside the drawer's lifecycle.
  // prefetchComments remains in useBoardData because the kanban cards (parent
  // JSX) call it on hover.

  // Filter layer: search/type/priority/assignee/tag state, the filter + sprint
  // menu-open flags and their outside-click refs + effect, and the derived
  // `existingTags` / `filteredItems` / `columnItemsByStatus` memos (kept stable
  // so the React.memo'd BoardColumn/KanbanCard can skip re-renders). Called once
  // here; `selectedSprintId` is threaded in so the sprint filter participates in
  // the same memoized chain.
  const {
    searchQuery,
    setSearchQuery,
    filterTypes,
    setFilterTypes,
    filterPriorities,
    setFilterPriorities,
    filterAssignees,
    setFilterAssignees,
    filterTags,
    setFilterTags,
    showFilterMenu,
    setShowFilterMenu,
    showSprintMenu,
    setShowSprintMenu,
    assigneeSearchFilter,
    setAssigneeSearchFilter,
    filterMenuRef,
    sprintMenuRef,
    existingTags,
    filteredItems,
    columnItemsByStatus,
    activeFilterCount,
    hasActiveFilters,
    clearAllFilters,
    toggleArrayFilter,
  } = useBoardFilters(workItems, selectedSprintId);

  // List-view grouping: the `listGroupBy` toggle (localStorage-persisted), the
  // per-group collapse set, the today memos, and the sprint/epic/week group
  // memos. Fed the memo-stable filteredItems/sprints/workItems so the group
  // memos hold; `showCompletedSprints` stays an orchestrator UI toggle.
  const {
    listGroupBy,
    setListGroupBy,
    collapsedSprints,
    toggleSprintCollapse,
    todayMidnightMs,
    listViewGroups,
    listViewEpicGroups,
    listViewWeekGroups,
  } = useListGrouping({
    filteredItems,
    workItems,
    sprints,
    id,
    showCompletedSprints,
  });

  // Work-item / project invalidation closures. Called every render with the
  // current `selectedItem` so `invalidateWorkItems` reads it fresh (no stale
  // snapshot — R11): it busts the drawer's per-item detail cache only when a
  // ticket is open. The still-inline mutations call these via the destructured
  // references below.
  const { invalidateWorkItems, invalidateProject } = useBoardInvalidations(id, selectedItem);

  // Filtered items — memoized so KanbanCard React.memo + BoardColumn React.memo
  // can rely on stable array references when filters don't change.
  // ── Mutations ─────────────────────────────────────────────────────────────
  // The 12 work-item / sprint / comment mutations + their handlers live in three
  // hooks under `hooks/`. They're called ONCE here and receive what they need as
  // params. R2: the optimistic move/status mutations key their cache read/write/
  // rollback off the SAME memoized `workItemFilters` reference (from useBoardData)
  // — never a rebuilt `{ project_id: id }`. R11: `selectedItem` and the
  // invalidate closures are passed live each render (no stale snapshot).
  const {
    moveMutation,
    createItemMutation,
    isCreatingItem,
    handleMoveToSprint,
    isSavingEdit,
    handleSaveEdit,
    handleDeleteItem,
    logHoursMutation,
    handleLogHours,
    handleStatusChange,
  } = useWorkItemMutations(id, {
    workItemFilters,
    invalidateWorkItems,
    invalidateProject,
    selectedItem,
    onCreateSuccess: () => setShowCreateForm(false),
    confirm,
  });

  // Drag-and-drop state + handlers live in useBoardDnd, which owns both the
  // state and the handlers together so handleDrop never reads a stale
  // draggedItem (R3). onMove is wired to the work-item move mutation — the
  // same call handleDrop made inline before. handleDrop only changes STATUS.
  const {
    draggedItem,
    dragOverColumn,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  } = useBoardDnd({ onMove: moveMutation.mutate });

  // Get next sprint
  const getNextSprint = (currentSprintId: number | null): number | null =>
    getNextSprintPure(currentSprintId, sprints);

  // Sprint mutations (create / edit / complete / delete) + handlers. The UI
  // state setters/values the onSuccess/handlers need are threaded in so the
  // close/reset/toast behavior stays byte-identical.
  const {
    createSprintMutation,
    handleCreateSprint,
    handleEditSprint,
    handleCompleteSprint,
    handleDeleteSprint,
  } = useSprintMutations(id, {
    sprints,
    invalidateWorkItems,
    editingSprint,
    completingSprintId,
    deletingSprintId,
    setShowCreateSprintModal,
    setEditingSprint,
    setCompletingSprintId,
    setDeletingSprintId,
  });

  const openEditSprintModal = (sprintKey: string) => {
    const sprint = sprints.find((s) => String(s.id) === sprintKey);
    if (!sprint) return;
    setEditingSprint(sprint);
  };

  // Sprint complete/edit/delete is a managerial action. The legacy gate was
  // `isProjectManager(user)` (role includes 'admin' or 'project_manager').
  // Capability mapping: `project.pm` is granted to admin (via `*`) and
  // project_manager (via `project.*`), but NOT developer. Project-level path:
  // developers flagged is_admin on this project or marked "Project Creator"
  // keep their existing override even without the capability. Computed here so
  // ListView stays props-down.
  const canManageSprints =
    can('project.pm') ||
    !!project?.developers?.some(
      (d) => d.email === user?.email && (d.is_admin || d.role === 'Project Creator'),
    );

  // Submit-comment mutation + handler.
  const { handleSubmitComment } = useCommentMutation({ selectedItem, project });

  // renderCommentContent, renderTextWithNewlines, parentExcludeIds,
  // epicExcludeIds all moved into ItemDetailDrawer (PR 9) — they were
  // drawer-only helpers/memos.

  // Open another item in the detail panel by its numeric id (used by hierarchy chips).
  // The drawer keys on selectedItem.id so navigation alone resets its internal
  // edit/form state. useCallback so KanbanCard memo can compare prop refs.
  const openItemByNumericId = useCallback(
    (numericId: number | null | undefined) => {
      if (numericId == null) return;
      const target = workItems.find((wi) => wi.id === String(numericId));
      if (!target) {
        toast.error('Referenced item not found');
        return;
      }
      navigate(`/project/${id}/board/${target.id}`);
    },
    [workItems, navigate, id],
  );

  // Stable callback used by BoardColumn to route card clicks. Extracted from
  // an inline arrow so prop reference is stable across renders.
  const handleCardOpen = useCallback(
    (itemId: string) => {
      navigate(`/project/${id}/board/${itemId}`);
    },
    [navigate, id],
  );

  // AI Generate — opens the AI Planning Modal. Sub-step / form state lives
  // inside the modal; only the architectures list (shared with the Architecture
  // Editor wrapper) is reset here.
  const handleAIGenerate = () => {
    setShowAIModal(true);
    setArchitectures([]);
  };

  // Architecture-editor save — invoked by ArchitectureEditor (rendered as a
  // sibling of the AI modal). Updates the architectures list that the AI
  // modal renders.
  const handleSaveArchitecture = async (
    archId: number,
    updates: { mermaid_code?: string; name?: string; description?: string },
  ): Promise<void> => {
    try {
      const updated = await apiFetch<ProjectArchitectureResponse>(
        `/api/prd/architectures/${archId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        },
      );
      setArchitectures((prev) => prev.map((a) => (a.id === archId ? updated : a)));
      toast.success('Architecture saved!');
      setEditingArchitecture(null);
    } catch {
      toast.error('Failed to save architecture');
    }
  };

  // Cache invalidation after AI flow commit (PRD or Roadmap).
  const handleAIPlanningCommitted = () => {
    invalidateWorkItems();
    invalidateProject();
  };

  if (isLoading) {
    return <BoardSkeleton />;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-white mb-2">Project not found</h2>
        <Button onClick={() => navigate('/')} variant="ghost" className="text-[#E0B954]">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Stats
  const totalPoints = workItems.reduce((sum, i) => sum + i.story_points, 0);
  const completedCount = workItems.filter((i) => i.status === 'done').length;
  const remainingHours = workItems
    .filter((i) => i.status !== 'done')
    .reduce((sum, i) => sum + i.remaining_hours, 0);

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF] flex flex-col">
      <Toaster position="top-right" theme="dark" richColors />
      {confirmDialog}

      {/* Top Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-40">
        <BoardHeader
          project={project}
          canWriteTracker={canWriteTracker}
          effectiveShowReviewer={effectiveShowReviewer}
          canWriteAI={can('project.ai.write')}
          isGenerating={isGenerating}
          onToggleReviewer={() => setShowReviewer((v) => !v)}
          onOpenAI={handleAIGenerate}
          onBackToDashboard={() => navigate('/')}
          onBackToOverview={() => navigate(`/project/${id}`)}
        />

        <BoardToolbar
          itemCount={workItems.length}
          totalPoints={totalPoints}
          completedCount={completedCount}
          remainingHours={remainingHours}
          sprints={sprints}
          selectedSprintId={selectedSprintId}
          setSelectedSprintId={setSelectedSprintId}
          showSprintMenu={showSprintMenu}
          setShowSprintMenu={setShowSprintMenu}
          sprintMenuRef={sprintMenuRef}
          filterMenu={
            <BoardFilterMenu
              project={project}
              typeConfig={TYPE_CONFIG}
              priorityColors={PRIORITY_COLORS}
              filterTypes={filterTypes}
              setFilterTypes={setFilterTypes}
              filterPriorities={filterPriorities}
              setFilterPriorities={setFilterPriorities}
              filterAssignees={filterAssignees}
              setFilterAssignees={setFilterAssignees}
              filterTags={filterTags}
              setFilterTags={setFilterTags}
              assigneeSearchFilter={assigneeSearchFilter}
              setAssigneeSearchFilter={setAssigneeSearchFilter}
              existingTags={existingTags}
              toggleArrayFilter={toggleArrayFilter}
              clearAllFilters={clearAllFilters}
              activeFilterCount={activeFilterCount}
              hasActiveFilters={hasActiveFilters}
              showFilterMenu={showFilterMenu}
              setShowFilterMenu={setShowFilterMenu}
              filterMenuRef={filterMenuRef}
            />
          }
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewTabs={VIEW_TABS}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onViewTabKeyDown={handleViewTabKeyDown}
          canWriteTracker={can('project.tracker_write')}
          showAddMenu={showAddMenu}
          setShowAddMenu={setShowAddMenu}
          onAddItem={(type) => {
            setCreateFormType(type);
            setShowCreateForm(true);
            setShowAddMenu(false);
          }}
          onAddSprint={() => {
            setShowCreateSprintModal(true);
            setShowAddMenu(false);
          }}
        />
      </header>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto">
        {viewMode === 'board' ? (
          /* KANBAN BOARD VIEW */
          <BoardView
            columnItemsByStatus={columnItemsByStatus}
            workItems={workItems}
            statusConfig={STATUS_CONFIG}
            token={token || ''}
            draggedItem={draggedItem}
            dragOverColumn={dragOverColumn}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onCardOpen={handleCardOpen}
            onCardOpenByNumericId={openItemByNumericId}
            onPrefetchComments={prefetchComments}
          />
        ) : viewMode === 'epic' ? (
          /* EPIC VIEW */
          <EpicView
            listViewEpicGroups={listViewEpicGroups}
            collapsedSprints={collapsedSprints}
            toggleSprintCollapse={toggleSprintCollapse}
            listSortKey={listSortKey}
            listSortDir={listSortDir}
            handleListSort={handleListSort}
            listItemComparator={listItemComparator}
            typeConfig={TYPE_CONFIG}
            priorityColors={PRIORITY_COLORS}
            onStatusChange={handleStatusChange}
            onPrefetchComments={prefetchComments}
            onOpenItem={handleCardOpen}
            onOpenEpic={(epicId) => navigate(`/project/${id}/board/${epicId}`)}
          />
        ) : (
          /* LIST VIEW */
          <ListView
            listViewGroups={listViewGroups}
            listViewWeekGroups={listViewWeekGroups}
            listGroupBy={listGroupBy}
            setListGroupBy={setListGroupBy}
            collapsedSprints={collapsedSprints}
            toggleSprintCollapse={toggleSprintCollapse}
            showCompletedSprints={showCompletedSprints}
            setShowCompletedSprints={setShowCompletedSprints}
            todayMidnightMs={todayMidnightMs}
            listSortKey={listSortKey}
            listSortDir={listSortDir}
            handleListSort={handleListSort}
            listItemComparator={listItemComparator}
            typeConfig={TYPE_CONFIG}
            priorityColors={PRIORITY_COLORS}
            canWriteTracker={canWriteTracker}
            canManageSprints={canManageSprints}
            onStatusChange={handleStatusChange}
            onPrefetchComments={prefetchComments}
            onOpenItem={handleCardOpen}
            onCompleteSprint={(sprintId) => setCompletingSprintId(sprintId)}
            onEditSprint={openEditSprintModal}
            onDeleteSprint={(sprintId) => setDeletingSprintId(sprintId)}
          />
        )}
      </div>

      <BoardModals
        project={project}
        workItems={workItems}
        sprints={sprints}
        allDevelopers={allDevelopers}
        id={id}
        token={token || ''}
        navigate={navigate}
        existingTags={existingTags}
        parseLocalDate={parseLocalDate}
        selectedItem={selectedItem}
        isSavingEdit={isSavingEdit}
        onSaveEdit={handleSaveEdit}
        onDeleteItem={handleDeleteItem}
        onStatusChange={handleStatusChange}
        onLogHours={handleLogHours}
        isLoggingHours={logHoursMutation.isPending}
        onMoveToSprint={handleMoveToSprint}
        onSubmitComment={handleSubmitComment}
        getNextSprint={getNextSprint}
        showCreateForm={showCreateForm}
        createFormType={createFormType}
        isCreatingItem={isCreatingItem}
        onCloseCreateForm={() => setShowCreateForm(false)}
        onSubmitCreateItem={(form) => createItemMutation.mutate(form)}
        showAIModal={showAIModal}
        architectures={architectures}
        setArchitectures={setArchitectures}
        onEditArchitecture={setEditingArchitecture}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        onCloseAIModal={() => setShowAIModal(false)}
        onAIPlanningCommitted={handleAIPlanningCommitted}
        setIsGenerating={setIsGenerating}
        showCreateSprintModal={showCreateSprintModal}
        onCloseCreateSprint={() => setShowCreateSprintModal(false)}
        onSubmitCreateSprint={handleCreateSprint}
        isCreatingSprint={createSprintMutation.isPending}
        editingSprint={editingSprint}
        onCloseEditSprint={() => setEditingSprint(null)}
        onSubmitEditSprint={handleEditSprint}
        completingSprintId={completingSprintId}
        onCloseCompleteSprint={() => setCompletingSprintId(null)}
        onConfirmCompleteSprint={handleCompleteSprint}
        deletingSprintId={deletingSprintId}
        onCloseDeleteSprint={() => setDeletingSprintId(null)}
        onConfirmDeleteSprint={handleDeleteSprint}
        effectiveShowReviewer={effectiveShowReviewer}
        onCloseReviewer={() => setShowReviewer(false)}
        onReviewerTaskUpdate={(itemId, updates) => {
          queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters, 'board'], (old) =>
            (old ?? []).map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
          );
          invalidateWorkItems();
        }}
        editingArchitecture={editingArchitecture}
        onSaveArchitecture={handleSaveArchitecture}
        onCloseArchitectureEditor={() => setEditingArchitecture(null)}
      />
    </div>
  );
};

export default ProjectBoard;
