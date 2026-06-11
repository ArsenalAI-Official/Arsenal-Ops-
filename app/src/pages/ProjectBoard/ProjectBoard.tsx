import { useState, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Sparkles,
  BookOpen,
  ClipboardList,
  Bug,
  Target,
  Clock,
  CheckCircle2,
  X,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  List,
  Layers,
  BarChart3,
  AlertCircle,
  Inbox,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ListFilter,
  Check,
  Repeat2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast, Toaster } from 'sonner';
import StatusDotMenu from '@/components/ProjectsPage/StatusDotMenu';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import type { WorkItem, Sprint } from '@/types/workItems';
// EditSprintModal's file also exports the CompleteSprintConfirm /
// DeleteSprintConfirm confirmation modals as named exports, which must be
// available eagerly. That static import already pulls the file into the main
// bundle, so a separate `lazy(() => import(...))` for EditSprintModal can't
// move it into its own chunk — Rollup will emit a warning and keep it inline.
// Keep EditSprintModal as a static import to match reality.
import EditSprintModal, {
  CompleteSprintConfirm,
  DeleteSprintConfirm,
} from './modals/EditSprintModal';
const AIPlanningModal = lazy(() => import('./modals/AIPlanningModal'));
const CreateItemModal = lazy(() => import('./modals/CreateItemModal'));
const CreateSprintModal = lazy(() => import('./modals/CreateSprintModal'));
const ItemDetailDrawer = lazy(() => import('./ItemDetailDrawer'));
import BoardColumn from './components/BoardColumn';
import ReviewerPanel from './ReviewerPanel';
import ArchitectureEditorWrapper from './ArchitectureEditorWrapper';
import { parseLocalDate, formatWeekRange } from './lib/listGrouping';
import { type ListSortKey } from './lib/listSort';
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

interface Architecture {
  id: number;
  name: string;
  description: string;
  architecture_type: string;
  mermaid_code: string;
  pros: string[];
  cons: string[];
  estimated_cost: string;
  complexity: string;
  time_to_implement: string;
  is_selected: boolean;
}

const STATUS_CONFIG = {
  backlog: { label: 'Backlog', color: '#555555', icon: Inbox, gradient: 'from-[#555555]/10' },
  todo: { label: 'To Do', color: '#60A5FA', icon: Plus, gradient: 'from-[#60A5FA]/10' },
  in_progress: {
    label: 'In Progress',
    color: '#E0B954',
    icon: Clock,
    gradient: 'from-[#E0B954]/10',
  },
  in_review: {
    label: 'In Review',
    color: '#A78BFA',
    icon: AlertCircle,
    gradient: 'from-[#A78BFA]/10',
  },
  done: { label: 'Done', color: '#34D399', icon: CheckCircle2, gradient: 'from-[#34D399]/10' },
} as const;

const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: {
    icon: ClipboardList,
    color: '#FBBF24',
    label: 'Subtask',
    bg: 'rgba(251,191,36,0.15)',
  },
};

const PRIORITY_COLORS = {
  critical: {
    border: 'border-[#EF4444]/60',
    text: 'text-[#EF4444]',
    bg: 'bg-[#EF4444]/10',
    hex: '#EF4444',
  },
  high: {
    border: 'border-[#F97316]/60',
    text: 'text-[#F97316]',
    bg: 'bg-[#F97316]/10',
    hex: '#F97316',
  },
  medium: {
    border: 'border-[#F59E0B]/50',
    text: 'text-[#F59E0B]',
    bg: 'bg-[#F59E0B]/10',
    hex: '#F59E0B',
  },
  low: {
    border: 'border-[#737373]/50',
    text: 'text-[#737373]',
    bg: 'bg-[#737373]/10',
    hex: '#737373',
  },
};

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
  // → off). The JSX-returning header-cell helper stays here for now (commit 9
  // owns the list view).
  const { listSortKey, listSortDir, handleListSort, listItemComparator } = useListSort();
  const renderListSortHeader = (label: string, key: ListSortKey) => {
    const active = listSortKey === key;
    const Icon = active ? (listSortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <button
        type="button"
        onClick={() => handleListSort(key)}
        className={`flex items-center gap-1 text-left uppercase tracking-wider hover:text-white transition-colors ${
          active ? 'text-[#E0B954]' : ''
        }`}
        aria-sort={active ? (listSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <Icon className="w-3 h-3 shrink-0" aria-hidden />
      </button>
    );
  };

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
  const [architectures, setArchitectures] = useState<Architecture[]>([]);
  const [editingArchitecture, setEditingArchitecture] = useState<Architecture | null>(null);

  // Sprint and timeline states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState<number | 'all' | 'unassigned'>('all');
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCompletedSprints, setShowCompletedSprints] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
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
      const updated = await apiFetch<Architecture>(`/api/prd/architectures/${archId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
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
    return (
      <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
        {/* Skeleton Header */}
        <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 sticky top-0 z-40">
          <div className="px-6 py-4 flex items-center gap-4">
            <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
            <div className="h-8 w-48 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
            <div className="ml-auto flex gap-2">
              <div className="h-8 w-24 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
              <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
            </div>
          </div>
          <div className="px-6 pb-3 flex gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
            ))}
          </div>
        </header>
        {/* Skeleton Board Columns */}
        <div className="flex gap-4 p-6">
          {[...Array(4)].map((_, col) => (
            <div key={col} className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-4 w-24 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                <div className="h-4 w-6 bg-[rgba(255,255,255,0.04)] rounded-full animate-pulse" />
              </div>
              <div className="space-y-3">
                {[...Array(col === 0 ? 4 : col === 1 ? 3 : col === 2 ? 2 : 1)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-14 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                      <div className="h-3 w-10 bg-[rgba(255,255,255,0.04)] rounded animate-pulse ml-auto" />
                    </div>
                    <div className="h-4 w-full bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                    <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                    <div className="flex items-center gap-2 pt-1">
                      <div className="h-5 w-5 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse" />
                      <div className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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

      {/* Top Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
            <div className="w-px h-6 bg-[rgba(255,255,255,0.18)]" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-sm font-bold text-[#080808] shadow-lg shadow-[#E0B954]/25">
                {project.key_prefix.substring(0, 2)}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{project.name}</h1>
                <p className="text-xs text-[#737373] font-mono">{project.key_prefix}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Reviewer entry — gated on `project.tracker_write`. The
                review queue's purpose is approving / closing in-review
                tickets, which requires the same write cap as edit/delete.
                Hidden entirely (not disabled) to avoid showing an entry
                that would lead to a dead-end queue. */}
            {canWriteTracker && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReviewer((v) => !v)}
                className={`text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2 h-9 px-3 ${effectiveShowReviewer ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954]' : ''}`}
                title="Review Mode"
              >
                <Eye className="w-3.5 h-3.5" />
                Reviewer
              </Button>
            )}
            {/* AI Generate — gated on `project.ai.write`. Hidden entirely
                when missing so the modal (which would 403 on submit) can't
                be opened. */}
            {can('project.ai.write') && (
              <Button
                onClick={handleAIGenerate}
                disabled={isGenerating}
                size="sm"
                className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-9 transition-opacity"
              >
                {isGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#080808]/30 border-t-[#080808] rounded-full animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    AI Generate
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={() => navigate(`/project/${id}`)}
              size="sm"
              className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-9 px-4 transition-opacity"
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Project Overview
            </Button>
          </div>
        </div>

        {/* Stats + Filters Bar */}
        <div className="px-6 py-2.5 flex items-center justify-between gap-4 border-t border-[rgba(255,255,255,0.03)]">
          {/* Left: Stats + Sprint + Filter */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {[
              { label: 'Items', value: workItems.length, icon: Layers },
              { label: 'Points', value: totalPoints, icon: BarChart3 },
              { label: 'Done', value: completedCount, icon: CheckCircle2 },
              { label: 'Hours Left', value: `${remainingHours}h`, icon: Clock },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <s.icon className="w-3.5 h-3.5 text-[#737373]" />
                <span className="text-[#737373]">{s.label}</span>
                <span className="text-white font-semibold">{s.value}</span>
              </div>
            ))}

            <div className="w-px h-4 bg-[rgba(255,255,255,0.07)]" />

            {/* Sprint Selector */}
            <div className="flex items-center gap-1.5 relative" ref={sprintMenuRef}>
              <span className="text-xs text-[#737373]">Sprint</span>
              <button
                onClick={() => setShowSprintMenu((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 h-8 text-xs border rounded-lg font-medium transition-colors ${
                  selectedSprintId !== 'all'
                    ? 'border-[#E0B954]/50 text-[#E0B954] bg-[#E0B954]/5'
                    : 'border-[rgba(255,255,255,0.1)] text-[#737373] bg-transparent hover:border-[rgba(255,255,255,0.2)] hover:text-white'
                }`}
              >
                {selectedSprintId === 'all'
                  ? 'All Sprints'
                  : selectedSprintId === 'unassigned'
                    ? 'Backlog'
                    : (sprints.find((s) => s.id === selectedSprintId)?.name ?? 'Sprint')}
                <svg
                  className="w-3 h-3 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showSprintMenu && (
                <div className="absolute top-full mt-2 left-9 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 min-w-[160px]">
                  <div className="p-1.5">
                    {(
                      [
                        { id: 'all', label: 'All Sprints' },
                        { id: 'unassigned', label: 'Backlog' },
                        ...sprints.map((s) => ({ id: s.id, label: s.name })),
                      ] as { id: string | number; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSelectedSprintId(opt.id as typeof selectedSprintId);
                          setShowSprintMenu(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                          selectedSprintId === opt.id
                            ? 'bg-[#E0B954]/10 text-[#E0B954]'
                            : 'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                        }`}
                      >
                        {selectedSprintId === opt.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#E0B954]" />
                        )}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <div className="relative" ref={filterMenuRef}>
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`flex items-center gap-1.5 px-2.5 h-8 text-xs border rounded-lg font-medium transition-colors ${
                    showFilterMenu || hasActiveFilters
                      ? 'border-[#E0B954]/50 text-[#E0B954] bg-[#E0B954]/5'
                      : 'border-[rgba(255,255,255,0.1)] text-[#737373] bg-transparent hover:border-[rgba(255,255,255,0.2)] hover:text-white'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Filter
                  {hasActiveFilters && (
                    <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold bg-[#E0B954] text-[#080808] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {showFilterMenu && (
                  <div className="absolute top-full mt-2 left-0 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 w-60">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)]">
                      <p className="text-xs font-semibold text-[#a3a3a3]">Filters</p>
                      <button
                        onClick={() => setShowFilterMenu(false)}
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] text-[#737373] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-1.5">
                      {/* Type */}
                      <div className="px-1.5 pt-2 pb-1">
                        <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                          Type
                        </p>
                        {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                          const checked = filterTypes.includes(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleArrayFilter(setFilterTypes, key)}
                              className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#E0B954] border-[#E0B954]' : 'border-[rgba(255,255,255,0.2)]'}`}
                              >
                                {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                              </div>
                              <config.icon
                                className="w-3.5 h-3.5 flex-shrink-0"
                                style={{ color: config.color }}
                              />
                              <span className="text-xs text-[#d4d4d4]">{config.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />

                      {/* Priority */}
                      <div className="px-1.5 pt-1 pb-1">
                        <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                          Priority
                        </p>
                        {Object.entries(PRIORITY_COLORS).map(([key, colors]) => {
                          const checked = filterPriorities.includes(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleArrayFilter(setFilterPriorities, key)}
                              className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#E0B954] border-[#E0B954]' : 'border-[rgba(255,255,255,0.2)]'}`}
                              >
                                {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                              </div>
                              <div
                                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.bg}`}
                              />
                              <span className="text-xs text-[#d4d4d4]">
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Assignee */}
                      {project?.developers && project.developers.length > 0 && (
                        <>
                          <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />
                          <div className="px-1.5 pt-1 pb-1">
                            <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                              Assignee
                            </p>
                            <div className="relative mb-1.5">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#737373]" />
                              <input
                                type="text"
                                placeholder="Search..."
                                value={assigneeSearchFilter}
                                onChange={(e) => setAssigneeSearchFilter(e.target.value)}
                                className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#555]"
                              />
                            </div>
                            <div className="space-y-0.5 max-h-48 overflow-y-auto">
                              {(!assigneeSearchFilter ||
                                'unassigned'.includes(assigneeSearchFilter.toLowerCase())) &&
                                (() => {
                                  const checked = filterAssignees.includes('unassigned');
                                  return (
                                    <button
                                      onClick={() =>
                                        toggleArrayFilter(setFilterAssignees, 'unassigned')
                                      }
                                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#E0B954] border-[#E0B954]' : 'border-[rgba(255,255,255,0.2)]'}`}
                                      >
                                        {checked && (
                                          <Check className="w-2.5 h-2.5 text-[#080808]" />
                                        )}
                                      </div>
                                      <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.08)] flex-shrink-0" />
                                      <span className="text-xs text-[#d4d4d4]">Unassigned</span>
                                    </button>
                                  );
                                })()}
                              {project.developers
                                .filter(
                                  (dev) =>
                                    dev.name
                                      .toLowerCase()
                                      .includes(assigneeSearchFilter.toLowerCase()) ||
                                    dev.email
                                      .toLowerCase()
                                      .includes(assigneeSearchFilter.toLowerCase()),
                                )
                                .map((dev) => {
                                  const checked = filterAssignees.includes(String(dev.id));
                                  return (
                                    <button
                                      key={dev.id}
                                      onClick={() =>
                                        toggleArrayFilter(setFilterAssignees, String(dev.id))
                                      }
                                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#E0B954] border-[#E0B954]' : 'border-[rgba(255,255,255,0.2)]'}`}
                                      >
                                        {checked && (
                                          <Check className="w-2.5 h-2.5 text-[#080808]" />
                                        )}
                                      </div>
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                        {dev.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="text-xs text-[#d4d4d4] truncate">
                                        {dev.name}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Tags */}
                      {existingTags.length > 0 && (
                        <>
                          <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />
                          <div className="px-1.5 pt-1 pb-1">
                            <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                              Tags
                            </p>
                            <div className="space-y-0.5 max-h-40 overflow-y-auto">
                              {existingTags.map((tag) => {
                                const checked = filterTags.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    onClick={() => toggleArrayFilter(setFilterTags, tag)}
                                    className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                                  >
                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#E0B954] border-[#E0B954]' : 'border-[rgba(255,255,255,0.2)]'}`}
                                    >
                                      {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                                    </div>
                                    <span className="text-xs text-[#d4d4d4]">{tag}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-[#737373] hover:text-red-400 transition-colors whitespace-nowrap"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Right: Search + view toggle + new sprint */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-48 text-xs bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
              />
            </div>

            {/* View Tab Bar */}
            <div
              role="tablist"
              aria-label="Project view"
              className="flex items-center gap-0"
              onKeyDown={handleViewTabKeyDown}
            >
              {VIEW_TABS.map(({ mode, icon: Icon, label, tabId }) => (
                <button
                  key={mode}
                  role="tab"
                  id={tabId}
                  aria-selected={viewMode === mode}
                  aria-controls={`tabpanel-${mode}`}
                  tabIndex={viewMode === mode ? 0 : -1}
                  onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    viewMode === mode
                      ? 'border-[#E0B954] text-[#E0B954]'
                      : 'border-transparent text-[#737373] hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {/* "+" menu — gated on `project.tracker_write`. */}
            {can('project.tracker_write') && (
              <div className="relative">
                <Button
                  onClick={() => setShowAddMenu((prev) => !prev)}
                  size="sm"
                  className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-8 px-3 text-xs transition-opacity flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
                {showAddMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl overflow-hidden min-w-[140px]">
                      <button
                        onClick={() => {
                          setCreateFormType('user_story');
                          setShowCreateForm(true);
                          setShowAddMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#E0B954]" />
                        New Item
                      </button>
                      <button
                        onClick={() => {
                          setCreateFormType('epic');
                          setShowCreateForm(true);
                          setShowAddMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      >
                        <Target className="w-3.5 h-3.5 text-[#A78BFA]" />
                        New Epic
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateSprintModal(true);
                          setShowAddMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      >
                        <Repeat2 className="w-3.5 h-3.5 text-[#E0B954]" />
                        New Sprint
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto">
        {viewMode === 'board' ? (
          /* KANBAN BOARD VIEW */
          <div
            role="tabpanel"
            id="tabpanel-board"
            aria-labelledby="tab-board"
            className="flex gap-4 p-6 min-h-[calc(100vh-140px)]"
          >
            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => {
              const config = STATUS_CONFIG[status];
              const columnItems = columnItemsByStatus[status] ?? [];
              const isDropTarget = dragOverColumn === status;

              return (
                <BoardColumn
                  key={status}
                  status={status}
                  config={config}
                  items={columnItems}
                  workItems={workItems}
                  isDropTarget={isDropTarget}
                  draggedItem={draggedItem}
                  token={token || ''}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onCardDragStart={handleDragStart}
                  onCardPrefetchComments={prefetchComments}
                  onCardOpen={handleCardOpen}
                  onCardOpenByNumericId={openItemByNumericId}
                />
              );
            })}
          </div>
        ) : viewMode === 'epic' ? (
          /* EPIC VIEW */
          <div
            role="tabpanel"
            id="tabpanel-epic"
            aria-labelledby="tab-epic"
            className="p-6 space-y-3"
          >
            {listViewEpicGroups.length === 0 ? (
              <div className="py-16 text-center text-[#737373] text-sm">No items found</div>
            ) : (
              listViewEpicGroups.map((group) => {
                const isCollapsed = collapsedSprints.has(group.key);
                const isUnparented = group.key === 'unparented';
                const epicKey = group.epic?.key as string | undefined;
                return (
                  <div
                    key={group.key}
                    className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
                  >
                    {/* Epic group header */}
                    <div className="flex items-center gap-2.5 px-5 py-3.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <button
                        onClick={() => toggleSprintCollapse(group.key)}
                        className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                        )}
                        {isUnparented ? (
                          <span className="text-sm font-semibold text-[#737373] italic">
                            No epic
                          </span>
                        ) : (
                          <>
                            <Target className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                            {epicKey && (
                              <span className="text-[11px] font-mono text-[#A78BFA] shrink-0">
                                {epicKey}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-[#f5f5f5] truncate">
                              {group.label}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-[#737373] shrink-0">
                          {group.count} item{group.count !== 1 ? 's' : ''}
                        </span>
                      </button>
                      {!isUnparented && group.epic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/project/${id}/board/${group.epic!.id}`);
                          }}
                          className="text-[10px] text-[#737373] hover:text-[#A78BFA] transition-colors shrink-0"
                          title="Open epic"
                        >
                          Open epic →
                        </button>
                      )}
                    </div>

                    {!isCollapsed && (
                      <>
                        {/* Table header */}
                        <div className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                          {renderListSortHeader('Type', 'type')}
                          <span>Title</span>
                          {renderListSortHeader('Status', 'status')}
                          {renderListSortHeader('Priority', 'priority')}
                          <span>Points</span>
                          {renderListSortHeader('Assignee', 'assignee')}
                          {renderListSortHeader('Due Date', 'due_date')}
                          {renderListSortHeader('Completed', 'completed_at')}
                        </div>
                        {/* Table rows. Default: hierarchy-aware (parent → child with
                            indent). When sorted, render flat at depth=0 since
                            cross-hierarchy ordering breaks the parent/child grouping. */}
                        {(listItemComparator
                          ? [...group.rows]
                              .sort((a, b) => listItemComparator(a.item, b.item))
                              .map((r) => ({ item: r.item, depth: 0 }))
                          : group.rows
                        ).map(({ item, depth }) => {
                          const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                          const TypeIcon = typeInfo.icon;
                          const priorityStyle =
                            PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                          return (
                            <div
                              key={item.id}
                              onMouseEnter={() => prefetchComments(item.id)}
                              onClick={() => {
                                navigate(`/project/${id}/board/${item.id}`);
                              }}
                              className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center">
                                <div
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                  style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                >
                                  <TypeIcon className="w-3 h-3" />
                                  {typeInfo.label}
                                </div>
                              </div>
                              <div
                                className="flex items-center gap-3 min-w-0"
                                style={{ paddingLeft: depth === 1 ? 24 : 0 }}
                              >
                                {depth === 1 && (
                                  <span
                                    className="text-[#444] font-mono text-xs shrink-0"
                                    aria-hidden
                                  >
                                    └─
                                  </span>
                                )}
                                <span className="text-[10px] text-[#E0B954] font-mono font-medium shrink-0">
                                  {item.key}
                                </span>
                                <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">
                                  {item.title}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <StatusDotMenu
                                  status={item.status}
                                  onChange={(newStatus) => handleStatusChange(item, newStatus)}
                                />
                              </div>
                              <div className="flex items-center">
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{
                                    backgroundColor: priorityStyle.hex + '33',
                                    color: priorityStyle.hex,
                                  }}
                                >
                                  {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-sm font-semibold text-[#E0B954]">
                                  {item.story_points}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {item.assignee && item.assignee !== 'Unassigned' ? (
                                  <>
                                    <div
                                      className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0"
                                      title={item.assignee}
                                    >
                                      <span className="text-[9px] font-semibold text-white">
                                        {item.assignee.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-xs text-[#a3a3a3] truncate">
                                      {item.assignee}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs text-[#555] truncate">—</span>
                                )}
                              </div>
                              <div className="flex items-center">
                                <span className="text-xs text-[#a3a3a3] truncate">
                                  {item.due_date
                                    ? parseLocalDate(item.due_date)?.toLocaleDateString()
                                    : '—'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-xs text-[#a3a3a3] truncate">
                                  {item.completed_at
                                    ? new Date(item.completed_at).toLocaleDateString()
                                    : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* LIST VIEW */
          <div
            role="tabpanel"
            id="tabpanel-list"
            aria-labelledby="tab-list"
            className="p-6 space-y-3"
          >
            {/* List view header: Group by toggle + completed-sprints toggle */}
            <div className="flex items-center justify-between gap-3">
              <div
                role="radiogroup"
                aria-label="Group list by"
                className="flex items-center bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg p-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={listGroupBy === 'sprint'}
                  onClick={() => setListGroupBy('sprint')}
                  className={`px-2.5 h-6 text-[11px] rounded-md transition-colors ${listGroupBy === 'sprint' ? 'bg-[#E0B954] text-[#080808] font-medium' : 'text-[#737373] hover:text-white'}`}
                >
                  By Sprint
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={listGroupBy === 'week'}
                  onClick={() => setListGroupBy('week')}
                  className={`px-2.5 h-6 text-[11px] rounded-md transition-colors ${listGroupBy === 'week' ? 'bg-[#E0B954] text-[#080808] font-medium' : 'text-[#737373] hover:text-white'}`}
                >
                  By Week
                </button>
              </div>
              {listGroupBy === 'sprint' && (
                <button
                  onClick={() => setShowCompletedSprints((v) => !v)}
                  className="flex items-center gap-1.5 px-3 h-7 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg text-[#737373] hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-colors"
                >
                  {showCompletedSprints ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  {showCompletedSprints ? 'Hide Completed Sprints' : 'Show Completed Sprints'}
                </button>
              )}
            </div>

            {listGroupBy === 'week' ? (
              listViewWeekGroups.length === 0 ? (
                <div className="py-16 text-center text-[#737373] text-sm">No items found</div>
              ) : (
                listViewWeekGroups.map((group) => {
                  const isCollapsed = collapsedSprints.has(group.key);
                  return (
                    <div
                      key={group.key}
                      className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
                    >
                      {/* Week group header */}
                      <div className="flex items-center gap-2.5 px-5 py-3.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                        <button
                          onClick={() => toggleSprintCollapse(group.key)}
                          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-[#f5f5f5]">
                            {group.label}
                          </span>
                          {group.weekStart && group.label !== formatWeekRange(group.weekStart) && (
                            <span className="text-[10px] text-[#555555]">
                              {formatWeekRange(group.weekStart)}
                            </span>
                          )}
                          {group.isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(224,185,84,0.12)] text-[#E0B954]">
                              Current
                            </span>
                          )}
                          <span className="text-xs text-[#737373]">
                            {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                          </span>
                        </button>
                      </div>

                      {!isCollapsed && (
                        <>
                          {/* Table header */}
                          <div className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                            {renderListSortHeader('Type', 'type')}
                            <span>Title</span>
                            {renderListSortHeader('Status', 'status')}
                            {renderListSortHeader('Priority', 'priority')}
                            <span>Points</span>
                            {renderListSortHeader('Assignee', 'assignee')}
                            {renderListSortHeader('Due Date', 'due_date')}
                            {renderListSortHeader('Completed', 'completed_at')}
                          </div>
                          {/* Table rows */}
                          {(listItemComparator
                            ? [...group.items].sort(listItemComparator)
                            : group.items
                          ).map((item) => {
                            const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                            const TypeIcon = typeInfo.icon;
                            const priorityStyle =
                              PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                            const dueDate = item.due_date ? parseLocalDate(item.due_date) : null;
                            const isOverdue =
                              !!dueDate &&
                              !item.completed_at &&
                              dueDate.getTime() < todayMidnightMs;
                            return (
                              <div
                                key={item.id}
                                onMouseEnter={() => prefetchComments(item.id)}
                                onClick={() => {
                                  navigate(`/project/${id}/board/${item.id}`);
                                }}
                                className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                              >
                                <div className="flex items-center">
                                  <div
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                    style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                  >
                                    <TypeIcon className="w-3 h-3" />
                                    {typeInfo.label}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-[10px] text-[#E0B954] font-mono font-medium shrink-0">
                                    {item.key}
                                  </span>
                                  <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">
                                    {item.title}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  {canWriteTracker ? (
                                    <StatusDotMenu
                                      status={item.status}
                                      onChange={(newStatus) => handleStatusChange(item, newStatus)}
                                    />
                                  ) : (
                                    <span className="text-xs text-[#a3a3a3] capitalize">
                                      {item.status.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                    style={{
                                      backgroundColor: priorityStyle.hex + '33',
                                      color: priorityStyle.hex,
                                    }}
                                  >
                                    {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-sm font-semibold text-[#E0B954]">
                                    {item.story_points}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {item.assignee && item.assignee !== 'Unassigned' ? (
                                    <>
                                      <div
                                        className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0"
                                        title={item.assignee}
                                      >
                                        <span className="text-[9px] font-semibold text-white">
                                          {item.assignee.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <span className="text-xs text-[#a3a3a3] truncate">
                                        {item.assignee}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-xs text-[#555] truncate">—</span>
                                  )}
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className={`text-xs truncate ${
                                      isOverdue ? 'text-[#EF4444]' : 'text-[#a3a3a3]'
                                    }`}
                                  >
                                    {dueDate ? dueDate.toLocaleDateString() : '—'}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className={`text-xs truncate ${
                                      item.completed_at ? 'text-[#E0B954]' : 'text-[#a3a3a3]'
                                    }`}
                                  >
                                    {item.completed_at
                                      ? new Date(item.completed_at).toLocaleDateString()
                                      : '—'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })
              )
            ) : listViewGroups.length === 0 ? (
              <div className="py-16 text-center text-[#737373] text-sm">No items found</div>
            ) : (
              listViewGroups.map((group) => {
                const isCollapsed = collapsedSprints.has(group.key);
                return (
                  <div
                    key={group.key}
                    className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
                  >
                    {/* Sprint group header */}
                    <div className="flex items-center gap-2.5 px-5 py-3.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors group/sprint-hdr">
                      <button
                        onClick={() => toggleSprintCollapse(group.key)}
                        className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-[#f5f5f5]">{group.label}</span>
                        {group.isCompleted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-[#555555]">
                            Completed
                          </span>
                        )}
                        <span className="text-xs text-[#737373]">
                          {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      {group.key !== 'backlog' &&
                        // Sprint complete/close is a managerial action. The
                        // legacy gate was `isProjectManager(user)` (user.role
                        // includes 'admin' or 'project_manager'). Capability
                        // mapping: `project.pm` is granted to the admin role
                        // (via `*`) and the project_manager role (via
                        // `project.*`), but NOT to the developer role —
                        // matching the original intent. Project-level path:
                        // developers flagged is_admin on this project or
                        // marked as "Project Creator" keep their existing
                        // override even without the capability.
                        (can('project.pm') ||
                          project?.developers?.some(
                            (d) =>
                              d.email === user?.email &&
                              (d.is_admin || d.role === 'Project Creator'),
                          )) && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!group.isCompleted && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCompletingSprintId(parseInt(group.key));
                                }}
                                className="p-1.5 rounded-md hover:bg-[rgba(224,185,84,0.1)] text-[#737373] hover:text-[#E0B954] transition-colors"
                                title="Complete sprint"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditSprintModal(group.key);
                              }}
                              className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-[#737373] hover:text-white transition-colors"
                              title="Edit sprint"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSprintId(parseInt(group.key));
                              }}
                              className="p-1.5 rounded-md hover:bg-[rgba(239,68,68,0.08)] text-[#737373] hover:text-[#EF4444] transition-colors"
                              title="Delete sprint"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                    </div>

                    {!isCollapsed && (
                      <>
                        {/* Table header */}
                        <div className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                          {renderListSortHeader('Type', 'type')}
                          <span>Title</span>
                          {renderListSortHeader('Status', 'status')}
                          {renderListSortHeader('Priority', 'priority')}
                          <span>Points</span>
                          {renderListSortHeader('Assignee', 'assignee')}
                          {renderListSortHeader('Due Date', 'due_date')}
                          {renderListSortHeader('Completed', 'completed_at')}
                        </div>
                        {/* Table rows */}
                        {(listItemComparator
                          ? [...group.items].sort(listItemComparator)
                          : group.items
                        ).map((item) => {
                          const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                          const TypeIcon = typeInfo.icon;
                          const priorityStyle =
                            PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                          return (
                            <div
                              key={item.id}
                              onMouseEnter={() => prefetchComments(item.id)}
                              onClick={() => {
                                navigate(`/project/${id}/board/${item.id}`);
                              }}
                              className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center">
                                <div
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                  style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                >
                                  <TypeIcon className="w-3 h-3" />
                                  {typeInfo.label}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] text-[#E0B954] font-mono font-medium shrink-0">
                                  {item.key}
                                </span>
                                <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">
                                  {item.title}
                                </span>
                              </div>
                              <div className="flex items-center">
                                {canWriteTracker ? (
                                  <StatusDotMenu
                                    status={item.status}
                                    onChange={(newStatus) => handleStatusChange(item, newStatus)}
                                  />
                                ) : (
                                  <span className="text-xs text-[#a3a3a3] capitalize">
                                    {item.status.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center">
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{
                                    backgroundColor: priorityStyle.hex + '33',
                                    color: priorityStyle.hex,
                                  }}
                                >
                                  {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-sm font-semibold text-[#E0B954]">
                                  {item.story_points}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {item.assignee && item.assignee !== 'Unassigned' ? (
                                  <>
                                    <div
                                      className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0"
                                      title={item.assignee}
                                    >
                                      <span className="text-[9px] font-semibold text-white">
                                        {item.assignee.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-xs text-[#a3a3a3] truncate">
                                      {item.assignee}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs text-[#555] truncate">—</span>
                                )}
                              </div>
                              <div className="flex items-center">
                                <span className="text-xs text-[#a3a3a3] truncate">
                                  {item.due_date
                                    ? parseLocalDate(item.due_date)?.toLocaleDateString()
                                    : '—'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <span className="text-xs text-[#a3a3a3] truncate">
                                  {item.completed_at
                                    ? new Date(item.completed_at).toLocaleDateString()
                                    : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Detail Slide-in Drawer */}
      {selectedItem && (
        <Suspense fallback={null}>
          <ItemDetailDrawer
            key={selectedItem.id}
            selectedItem={selectedItem}
            workItems={workItems}
            sprints={sprints}
            project={project}
            allDevelopers={allDevelopers}
            id={id}
            token={token || ''}
            navigate={navigate}
            parseLocalDate={parseLocalDate}
            isSavingEdit={isSavingEdit}
            onSaveEdit={handleSaveEdit}
            onDeleteItem={handleDeleteItem}
            onStatusChange={handleStatusChange}
            onLogHours={handleLogHours}
            isLoggingHours={logHoursMutation.isPending}
            onMoveToSprint={handleMoveToSprint}
            onSubmitComment={handleSubmitComment}
            getNextSprint={getNextSprint}
          />
        </Suspense>
      )}

      {/* Create Item Modal */}
      {showCreateForm && (
        <Suspense fallback={null}>
          <CreateItemModal
            project={project}
            workItems={workItems}
            existingTags={existingTags}
            parseLocalDate={parseLocalDate}
            isCreatingItem={isCreatingItem}
            initialType={createFormType}
            onClose={() => setShowCreateForm(false)}
            onSubmit={(form) => createItemMutation.mutate(form)}
          />
        </Suspense>
      )}

      {/* AI Planning Modal */}
      {showAIModal && (
        <Suspense fallback={null}>
          <AIPlanningModal
            project={project}
            architectures={architectures}
            setArchitectures={setArchitectures}
            onEditArchitecture={setEditingArchitecture}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onClose={() => setShowAIModal(false)}
            onCommitted={handleAIPlanningCommitted}
            setIsGenerating={setIsGenerating}
          />
        </Suspense>
      )}

      {/* Create Sprint Modal */}
      {showCreateSprintModal && (
        <Suspense fallback={null}>
          <CreateSprintModal
            parseLocalDate={parseLocalDate}
            onClose={() => setShowCreateSprintModal(false)}
            onSubmit={handleCreateSprint}
            disabled={createSprintMutation.isPending}
          />
        </Suspense>
      )}

      {/* Edit Sprint Modal */}
      {editingSprint && (
        <Suspense fallback={null}>
          <EditSprintModal
            key={editingSprint.id}
            editingSprint={editingSprint}
            parseLocalDate={parseLocalDate}
            onClose={() => setEditingSprint(null)}
            onSubmit={handleEditSprint}
          />
        </Suspense>
      )}

      {/* Complete Sprint Confirmation */}
      {completingSprintId !== null && (
        <CompleteSprintConfirm
          sprintId={completingSprintId}
          sprints={sprints}
          workItems={workItems}
          onClose={() => setCompletingSprintId(null)}
          onConfirm={handleCompleteSprint}
        />
      )}

      {/* Delete Sprint Confirmation */}
      {deletingSprintId !== null && (
        <DeleteSprintConfirm
          sprintId={deletingSprintId}
          sprints={sprints}
          workItems={workItems}
          onClose={() => setDeletingSprintId(null)}
          onConfirm={handleDeleteSprint}
        />
      )}

      {/* Reviewer Panel - slide in from right. Gated on the derived
          `effectiveShowReviewer` so a mid-session cap revocation closes
          the panel even when local `showReviewer` state is still true. */}
      {effectiveShowReviewer && (
        <ReviewerPanel
          workItems={workItems}
          projectId={id!}
          token={token!}
          onClose={() => setShowReviewer(false)}
          onTaskUpdate={(itemId, updates) => {
            queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters, 'board'], (old) =>
              (old ?? []).map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
            );
            invalidateWorkItems();
          }}
        />
      )}

      {/* Architecture Editor Modal */}
      {editingArchitecture && (
        <ArchitectureEditorWrapper
          architecture={editingArchitecture}
          onSave={handleSaveArchitecture}
          onClose={() => setEditingArchitecture(null)}
        />
      )}
    </div>
  );
};

export default ProjectBoard;
