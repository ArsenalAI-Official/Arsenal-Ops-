import { useState, useEffect, useMemo, useRef, Dispatch, SetStateAction } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ListFilter,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast, Toaster } from 'sonner';
import StatusDotMenu from '@/components/ProjectsPage/StatusDotMenu';
import { useAuth, isProjectManager } from '@/contexts/AuthContext';
import { buildEpicGroups } from '@/lib/hierarchy/buildEpicGroups';
import { apiFetch } from '@/lib/api';
import AIPlanningModal from './modals/AIPlanningModal';
import CreateItemModal, { CreateItemFormValues } from './modals/CreateItemModal';
import CreateSprintModal from './modals/CreateSprintModal';
import EditSprintModal, {
  CompleteSprintConfirm,
  DeleteSprintConfirm,
} from './modals/EditSprintModal';
import BoardColumn from './components/BoardColumn';
import ItemDetailDrawer from './ItemDetailDrawer';
import ReviewerPanel from './ReviewerPanel';
import ArchitectureEditorWrapper from './ArchitectureEditorWrapper';

// Helper function to parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
const parseLocalDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

interface WorkItem {
  id: string;
  key: string; // Ticket key like PROJ-123
  type: 'user_story' | 'task' | 'bug' | 'epic';
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  assigned_hours: number;
  remaining_hours: number;
  logged_hours: number;
  story_points: number;
  priority: 'high' | 'medium' | 'low' | 'critical';
  assignee: string;
  assignee_id: number | null;
  sprint: string;
  sprint_id: number | null;
  product_id: string;
  tags: string[];
  epic: string;
  parent_id?: number | null;
  epic_id?: number | null;
  parent_key?: string | null;
  epic_key?: string | null;
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  estimated_hours?: number | null;
}

interface Developer {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  role: string;
  responsibilities?: string;
  is_admin?: boolean;
}

interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  created_at: string;
  work_item_stats: {
    total: number;
    by_status: Record<string, number>;
    total_points: number;
    completed: number;
    completion_pct: number;
  };
  developers?: Developer[];
}

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

interface Sprint {
  id: number;
  name: string;
  goal: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  capacity_hours: number | null;
  velocity: number | null;
  total_items: number;
  todo_count: number;
  in_progress_count: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  completion_pct: number;
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
  const { token, user } = useAuth(); // token kept for legacy child components (TimeEntriesTable, TicketContributors, ReviewerView)
  const queryClient = useQueryClient();
  const [showReviewer, setShowReviewer] = useState(false);
  // isEditing + editForm + drawer comment state moved into ItemDetailDrawer
  // (PR 9). The drawer keys on selectedItem.id so state resets cleanly when
  // the user navigates to a different ticket.
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [listGroupBy, setListGroupBy] = useState<'sprint' | 'epic'>(() => {
    if (typeof window === 'undefined') return 'sprint';
    try {
      const stored = window.localStorage.getItem(`projectBoard.listGroupBy.${id ?? ''}`);
      return stored === 'epic' ? 'epic' : 'sprint';
    } catch {
      return 'sprint';
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;
    try {
      window.localStorage.setItem(`projectBoard.listGroupBy.${id}`, listGroupBy);
    } catch {
      /* ignore quota errors */
    }
  }, [listGroupBy, id]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSprintMenu, setShowSprintMenu] = useState(false);
  const [assigneeSearchFilter, setAssigneeSearchFilter] = useState('');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const sprintMenuRef = useRef<HTMLDivElement>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
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

  const projectQuery = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => apiFetch<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
  const project = projectQuery.data ?? null;
  const isLoading = projectQuery.isLoading;

  // Filters object drives the query key so filter changes auto-refetch.
  // useMemo keeps the reference stable across renders so the query key
  // (and any closures holding it) stay equal.
  const workItemFilters = useMemo(() => ({ project_id: id }), [id]);
  const workItemsQuery = useQuery<WorkItem[]>({
    queryKey: ['workItems', workItemFilters],
    queryFn: () => apiFetch<WorkItem[]>(`/api/workitems/?project_id=${id}`),
    enabled: !!id,
  });
  // Stabilize ref so downstream useMemos (parentExcludeIds, existingTags) don't bust on every render.
  const workItems = useMemo(() => workItemsQuery.data ?? [], [workItemsQuery.data]);

  const sprintsQuery = useQuery<Sprint[]>({
    queryKey: ['sprints', id],
    queryFn: () => apiFetch<Sprint[]>(`/api/workitems/projects/${id}/sprints`),
    enabled: !!id,
  });
  const sprints = sprintsQuery.data ?? [];

  const developersQuery = useQuery<Array<{ id: number; name: string; email: string }>>({
    queryKey: ['developers'],
    queryFn: () => apiFetch('/api/developers/'),
  });
  const allDevelopers = developersQuery.data ?? [];

  // Selected ticket — derived from URL param + workItems cache (no extra fetch)
  const selectedItem = ticketId ? (workItems.find((item) => item.id === ticketId) ?? null) : null;

  // commentsQuery moved to ItemDetailDrawer (PR 9). Documented exception to
  // CONVENTIONS rule "queries stay at parent": this query is keyed on the
  // currently-open ticket and is only consumed inside the drawer's lifecycle.
  // prefetchComments remains here because the kanban cards (parent JSX) call
  // it on hover.

  // Prefetch comments on hover so data is ready before the drawer opens
  const prefetchComments = (itemId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['workItem', itemId, 'comments'],
      queryFn: () => apiFetch(`/api/comments/workitem/${itemId}`),
    });
  };

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
        setAssigneeSearchFilter('');
      }
    };
    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterMenu]);

  // Close sprint menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sprintMenuRef.current && !sprintMenuRef.current.contains(event.target as Node)) {
        setShowSprintMenu(false);
      }
    };
    if (showSprintMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSprintMenu]);

  // Derived: unique tags computed from cached workItems — no useEffect needed
  const existingTags = useMemo(
    () =>
      Array.from(
        new Set(
          workItems
            .filter((item) => item.type === 'task')
            .flatMap((item) => (item.tags ?? []).map((t: string) => String(t).trim().toLowerCase()))
            .filter(Boolean),
        ),
      ).sort(),
    [workItems],
  );

  // Helper: invalidate workItems list (prefix match) plus the current user's
  // MyTasks view, which any work-item write may affect if the assignee is
  // the active user.
  const invalidateWorkItems = () => {
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  };
  // Helper: invalidate project (stats)
  const invalidateProject = () => queryClient.invalidateQueries({ queryKey: ['project', id] });

  // Filtered items
  const filteredItems = workItems.filter((item) => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(searchLower);
      const keyMatch = item.key.toLowerCase().includes(searchLower);
      if (!titleMatch && !keyMatch) return false;
    }
    if (filterTypes.length > 0 && !filterTypes.includes(item.type)) return false;
    if (filterPriorities.length > 0 && !filterPriorities.includes(item.priority)) return false;
    if (filterAssignees.length > 0) {
      const isUnassigned = item.assignee_id === null || item.assignee_id === undefined;
      const matchesUnassigned = filterAssignees.includes('unassigned') && isUnassigned;
      const matchesAssignee = filterAssignees.some(
        (id) => id !== 'unassigned' && String(item.assignee_id) === id,
      );
      if (!matchesUnassigned && !matchesAssignee) return false;
    }
    // Tags filter - if any tags are selected, item must have at least one of them
    if (filterTags.length > 0) {
      const hasMatchingTag = filterTags.some((tag) => item.tags?.includes(tag));
      if (!hasMatchingTag) return false;
    }
    // Sprint filter
    if (selectedSprintId === 'unassigned' && item.sprint_id !== null) return false;
    if (typeof selectedSprintId === 'number' && item.sprint_id !== selectedSprintId) return false;
    return true;
  });

  const activeFilterCount =
    filterTypes.length + filterPriorities.length + filterAssignees.length + filterTags.length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setFilterTypes([]);
    setFilterPriorities([]);
    setFilterAssignees([]);
    setFilterTags([]);
  };
  const toggleArrayFilter = (setter: Dispatch<SetStateAction<string[]>>, value: string) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // Sprint grouping for list view
  const listViewToday = new Date().toISOString().split('T')[0];
  const isSprintCompleted = (s: Sprint) =>
    s.status === 'completed' || (s.end_date != null && s.end_date < listViewToday);
  const isSprintActive = (s: Sprint) =>
    s.status === 'active' ||
    (s.start_date != null &&
      s.start_date <= listViewToday &&
      s.end_date != null &&
      s.end_date >= listViewToday);

  const orderedListSprints = [
    ...sprints
      .filter((s) => !isSprintCompleted(s) && isSprintActive(s))
      .sort(
        (a, b) => new Date(b.start_date ?? 0).getTime() - new Date(a.start_date ?? 0).getTime(),
      ),
    ...sprints
      .filter((s) => !isSprintCompleted(s) && !isSprintActive(s))
      .sort(
        (a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime(),
      ),
    ...(showCompletedSprints
      ? sprints
          .filter(isSprintCompleted)
          .sort((a, b) => new Date(b.end_date ?? 0).getTime() - new Date(a.end_date ?? 0).getTime())
      : []),
  ];

  const listViewGroups = [
    ...orderedListSprints.map((sprint) => ({
      key: String(sprint.id),
      label: sprint.name,
      isCompleted: isSprintCompleted(sprint),
      items: filteredItems.filter((item) => item.sprint_id === sprint.id),
    })),
    {
      key: 'backlog',
      label: 'Backlog',
      isCompleted: false,
      items: filteredItems.filter((item) => !item.sprint_id),
    },
  ].filter((g) => g.items.length > 0);

  const listViewEpicGroups = buildEpicGroups(filteredItems, workItems).groups;

  const toggleSprintCollapse = (key: string) => {
    setCollapsedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (itemId: string) => {
    setDraggedItem(itemId);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Drag-drop: optimistic status update
  const moveMutation = useMutation({
    mutationFn: ({ itemId, newStatus }: { itemId: string; newStatus: string }) =>
      apiFetch(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onMutate: async ({ itemId, newStatus }) => {
      // Cancel by prefix so sibling ['workItems', ...] queries (with other
      // filters) can't overwrite the optimistic state mid-flight. F-C3.
      await queryClient.cancelQueries({ queryKey: ['workItems'] });
      const previous = queryClient.getQueryData<WorkItem[]>(['workItems', workItemFilters]);
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
        (old ?? []).map((t) =>
          t.id === itemId ? { ...t, status: newStatus as WorkItem['status'] } : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['workItems', workItemFilters], ctx.previous);
      toast.error('Failed to move ticket');
    },
    onSettled: () => {
      invalidateWorkItems();
      invalidateProject();
    },
  });

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedItem) return;
    moveMutation.mutate({ itemId: draggedItem, newStatus });
    setDraggedItem(null);
  };

  // Create work item mutation. Form values are supplied by the
  // CreateItemModal (which owns the form state).
  const createItemMutation = useMutation({
    mutationFn: (form: CreateItemFormValues) => {
      const payload: any = {
        type: form.type,
        title: form.title,
        description: form.description,
        priority: form.priority,
        story_points: form.type !== 'task' ? form.story_points : 0,
        assignee_id: form.assignee_id,
        project_id: id,
        status: 'todo',
        tags: Array.isArray(form.tags) ? form.tags : [],
        epic_id: form.epic_id || null,
        parent_id: form.parent_id || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours
          ? parseInt(form.estimated_hours as string)
          : 0,
      };
      if (form.type !== 'task') {
        payload.assigned_hours = form.story_points * 4;
        payload.remaining_hours = form.story_points * 4;
      } else {
        payload.assigned_hours = payload.estimated_hours || 0;
        payload.remaining_hours = payload.estimated_hours || 0;
      }
      return apiFetch<WorkItem>('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setShowCreateForm(false);
      toast.success('Work item created!', { duration: 1000 });
      invalidateWorkItems();
      invalidateProject();
    },
    onError: (err: any) => {
      console.error('Failed to create item:', err);
      toast.error('Failed to create item');
    },
  });
  const isCreatingItem = createItemMutation.isPending;

  // Move ticket to sprint mutation
  const moveSprintMutation = useMutation({
    mutationFn: ({ itemId, targetSprintId }: { itemId: string; targetSprintId: number | null }) =>
      apiFetch<WorkItem>(`/api/workitems/${itemId}/move-sprint`, {
        method: 'PUT',
        body: JSON.stringify({ target_sprint_id: targetSprintId }),
      }),
    onSuccess: (_data, { targetSprintId }) => {
      toast.success(targetSprintId ? 'Moved to sprint' : 'Moved to backlog');
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to move ticket'),
  });

  const handleMoveToSprint = (itemId: string, targetSprintId: number | null) => {
    moveSprintMutation.mutate({ itemId, targetSprintId });
  };

  // Get next sprint
  const getNextSprint = (currentSprintId: number | null): number | null => {
    if (!currentSprintId || sprints.length === 0) return null;
    const currentIndex = sprints.findIndex((s) => s.id === currentSprintId);
    if (currentIndex >= 0 && currentIndex < sprints.length - 1) {
      return sprints[currentIndex + 1].id;
    }
    return null;
  };

  // Create sprint
  // Create sprint mutation
  const createSprintMutation = useMutation({
    mutationFn: (vars: {
      name: string;
      goal: string;
      start_date: string | null;
      end_date: string | null;
    }) =>
      apiFetch('/api/workitems/sprints/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(id!),
          name: vars.name,
          goal: vars.goal,
          start_date: vars.start_date,
          end_date: vars.end_date,
        }),
      }),
    onSuccess: () => {
      toast.success('Sprint created!');
      setShowCreateSprintModal(false);
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to create sprint'),
  });

  const handleCreateSprint = (form: {
    name: string;
    goal: string;
    start_date: string;
    end_date: string;
  }) => {
    if (createSprintMutation.isPending) return;
    if (!form.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    // Check for duplicate sprint names
    const duplicateName = sprints.some(
      (s) => s.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (duplicateName) {
      toast.error('A sprint with this name already exists');
      return;
    }
    if (!form.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (!form.end_date) {
      toast.error('End date is required');
      return;
    }
    const startDate = parseLocalDate(form.start_date);
    const endDate = parseLocalDate(form.end_date);
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date must be equal to or after start date');
      return;
    }
    // Check for overlaps with existing sprints
    if (startDate && endDate && sprints.length > 0) {
      const hasOverlap = sprints.some((existingSprint) => {
        if (!existingSprint.start_date || !existingSprint.end_date) return false;
        const existingStart = new Date(existingSprint.start_date);
        const existingEnd = new Date(existingSprint.end_date);
        return startDate <= existingEnd && endDate >= existingStart;
      });
      if (hasOverlap) {
        toast.error('Sprint dates overlap with an existing sprint. Sprints cannot overlap.');
        return;
      }
    }
    createSprintMutation.mutate({
      name: form.name,
      goal: form.goal,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  };

  const openEditSprintModal = (sprintKey: string) => {
    const sprint = sprints.find((s) => String(s.id) === sprintKey);
    if (!sprint) return;
    setEditingSprint(sprint);
  };

  // Edit sprint mutation
  const editSprintMutation = useMutation({
    mutationFn: (vars: {
      sprintId: number;
      name: string;
      goal: string;
      start_date: string | null;
      end_date: string | null;
    }) =>
      apiFetch(`/api/workitems/sprints/${vars.sprintId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: vars.name,
          goal: vars.goal,
          start_date: vars.start_date,
          end_date: vars.end_date,
        }),
      }),
    onSuccess: () => {
      toast.success('Sprint updated!');
      setEditingSprint(null);
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to update sprint'),
  });

  const handleEditSprint = (form: {
    name: string;
    goal: string;
    start_date: string;
    end_date: string;
  }) => {
    if (!editingSprint || !form.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    const duplicateName = sprints.some(
      (s) =>
        s.id !== editingSprint.id &&
        s.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (duplicateName) {
      toast.error('A sprint with this name already exists');
      return;
    }
    if (!form.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (!form.end_date) {
      toast.error('End date is required');
      return;
    }
    const startDate = parseLocalDate(form.start_date);
    const endDate = parseLocalDate(form.end_date);
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date must be equal to or after start date');
      return;
    }
    if (startDate && endDate) {
      const hasOverlap = sprints.some((s) => {
        if (s.id === editingSprint.id || !s.start_date || !s.end_date) return false;
        return startDate <= new Date(s.end_date) && endDate >= new Date(s.start_date);
      });
      if (hasOverlap) {
        toast.error('Sprint dates overlap with an existing sprint.');
        return;
      }
    }
    editSprintMutation.mutate({
      sprintId: editingSprint.id,
      name: form.name,
      goal: form.goal,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  };

  // Complete sprint mutation
  const completeSprintMutation = useMutation({
    mutationFn: (sprintId: number) =>
      apiFetch(`/api/workitems/sprints/${sprintId}/complete`, { method: 'PUT' }),
    onSuccess: (_data, sprintId) => {
      const sprint = sprints.find((s) => s.id === sprintId);
      toast.success(`"${sprint?.name}" has been completed.`);
      setCompletingSprintId(null);
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to complete sprint'),
  });

  const handleCompleteSprint = () => {
    if (!completingSprintId) return;
    completeSprintMutation.mutate(completingSprintId);
  };

  // Delete sprint mutation
  const deleteSprintMutation = useMutation({
    mutationFn: (sprintId: number) =>
      apiFetch(`/api/workitems/sprints/${sprintId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sprint deleted');
      setDeletingSprintId(null);
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to delete sprint'),
  });

  const handleDeleteSprint = () => {
    if (!deletingSprintId) return;
    deleteSprintMutation.mutate(deletingSprintId);
  };

  // Submit comment mutation — captures workItemId in vars so a drawer-close
  // race can't make us invalidate ['workItem', undefined, 'comments'].
  const submitCommentMutation = useMutation({
    mutationFn: ({
      workItemId,
      content,
      authorId,
      commentType,
    }: {
      workItemId: string;
      content: string;
      authorId: number;
      commentType: 'comment' | 'blocker' | 'business_review';
    }) =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(workItemId),
          content,
          author_id: authorId,
          comment_type: commentType,
        }),
      }),
    onSuccess: (_data, { workItemId, commentType }) => {
      queryClient.invalidateQueries({ queryKey: ['workItem', workItemId, 'comments'] });
      const messages = {
        blocker: 'Blocker reported!',
        business_review: 'Business Review comment added!',
        comment: 'Comment added!',
      } as const;
      toast.success(messages[commentType]);
    },
    onError: () => toast.error('Failed to add comment'),
  });

  const handleSubmitComment = (
    content: string,
    commentType: 'comment' | 'blocker' | 'business_review' = 'comment',
  ) => {
    if (!selectedItem || !content.trim()) return;
    submitCommentMutation.mutate({
      workItemId: selectedItem.id,
      content,
      authorId: project?.developers?.[0]?.id || 1,
      commentType,
    });
  };

  // renderCommentContent, renderTextWithNewlines, parentExcludeIds,
  // epicExcludeIds all moved into ItemDetailDrawer (PR 9) — they were
  // drawer-only helpers/memos.

  // Open another item in the detail panel by its numeric id (used by hierarchy chips).
  // The drawer keys on selectedItem.id so navigation alone resets its internal
  // edit/form state.
  const openItemByNumericId = (numericId: number | null | undefined) => {
    if (numericId == null) return;
    const target = workItems.find((wi) => wi.id === String(numericId));
    if (!target) {
      toast.error('Referenced item not found');
      return;
    }
    navigate(`/project/${id}/board/${target.id}`);
  };

  // Save edited item mutation. Accepts the form payload from the drawer so
  // the mutation stays at the parent (R3) while the form state lives in the
  // child.
  const saveEditMutation = useMutation({
    mutationFn: ({ itemId, edits }: { itemId: string; edits: Partial<WorkItem> }) =>
      apiFetch<WorkItem>(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(edits),
      }),
    onSuccess: (updated, { edits }) => {
      // Merge: backend may omit fields like due_date; prefer edit form values
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
        (old ?? []).map((wi) =>
          wi.id === updated.id ? ({ ...wi, ...edits, ...updated } as WorkItem) : wi,
        ),
      );
      toast.success('Item updated!');
      invalidateWorkItems();
      invalidateProject();
    },
    onError: () => toast.error('Failed to update item'),
  });
  const isSavingEdit = saveEditMutation.isPending;

  const handleSaveEdit = (edits: Partial<WorkItem>) => {
    if (!selectedItem || isSavingEdit) return;
    saveEditMutation.mutate({ itemId: selectedItem.id, edits });
  };

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => apiFetch(`/api/workitems/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      navigate(`/project/${id}/board`);
      toast.success('Item deleted');
      invalidateWorkItems();
      invalidateProject();
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const handleDeleteItem = (itemId: string) => {
    if (!confirm('Delete this work item?')) return;
    deleteItemMutation.mutate(itemId);
  };

  // Log hours mutation
  const logHoursMutation = useMutation({
    mutationFn: ({ itemId, hours }: { itemId: string; hours: number }) =>
      apiFetch<{ logged_hours: number; remaining_hours: number }>(
        `/api/workitems/${itemId}/log-hours`,
        { method: 'POST', body: JSON.stringify({ hours }) },
      ),
    onSuccess: (data, { itemId, hours }) => {
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
        (old ?? []).map((wi) =>
          wi.id === itemId
            ? { ...wi, logged_hours: data.logged_hours, remaining_hours: data.remaining_hours }
            : wi,
        ),
      );
      toast.success(`Logged ${hours}h! Remaining: ${data.remaining_hours}h`);
      invalidateWorkItems();
      invalidateProject();
    },
    onError: () => toast.error('Failed to log hours'),
  });

  const handleLogHours = (item: WorkItem, hoursToLog: number) => {
    logHoursMutation.mutate({ itemId: item.id, hours: hoursToLog });
  };

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
    queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    invalidateProject();
  };

  // Quick status change — optimistic via the same cache key as drag-drop
  const statusChangeMutation = useMutation({
    mutationFn: ({ itemId, newStatus }: { itemId: string; newStatus: string }) =>
      apiFetch(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onMutate: async ({ itemId, newStatus }) => {
      // Prefix cancel — see moveMutation above. F-C3.
      await queryClient.cancelQueries({ queryKey: ['workItems'] });
      const previous = queryClient.getQueryData<WorkItem[]>(['workItems', workItemFilters]);
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
        (old ?? []).map((t) =>
          t.id === itemId ? { ...t, status: newStatus as WorkItem['status'] } : t,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['workItems', workItemFilters], ctx.previous);
      toast.error('Failed to update status');
    },
    onSettled: () => {
      invalidateWorkItems();
      invalidateProject();
    },
  });

  const handleStatusChange = (item: WorkItem, newStatus: string) => {
    statusChangeMutation.mutate({ itemId: item.id, newStatus });
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReviewer((v) => !v)}
              className={`text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2 h-9 px-3 ${showReviewer ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954]' : ''}`}
              title="Review Mode"
            >
              <Eye className="w-3.5 h-3.5" />
              Reviewer
            </Button>
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

            {/* View Toggle */}
            <div className="flex bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('board')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'board' ? 'bg-[#E0B954] text-[#080808]' : 'text-[#737373] hover:text-white'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[#E0B954] text-[#080808]' : 'text-[#737373] hover:text-white'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <Button
                onClick={() => setShowAddMenu((prev) => !prev)}
                size="sm"
                className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-8 px-3 text-xs transition-opacity"
              >
                <Plus className="w-3 h-3" />
              </Button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl overflow-hidden min-w-[130px]">
                    <button
                      onClick={() => {
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
                        setShowCreateSprintModal(true);
                        setShowAddMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#E0B954]" />
                      New Sprint
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto">
        {viewMode === 'board' ? (
          /* KANBAN BOARD VIEW */
          <div className="flex gap-4 p-6 min-h-[calc(100vh-140px)]">
            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => {
              const config = STATUS_CONFIG[status];
              const columnItems = filteredItems.filter((item) => item.status === status);
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
                  onCardOpen={(itemId) => {
                    navigate(`/project/${id}/board/${itemId}`);
                  }}
                  onCardOpenByNumericId={openItemByNumericId}
                />
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="p-6 space-y-3">
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
                  aria-checked={listGroupBy === 'epic'}
                  onClick={() => setListGroupBy('epic')}
                  className={`px-2.5 h-6 text-[11px] rounded-md transition-colors ${listGroupBy === 'epic' ? 'bg-[#E0B954] text-[#080808] font-medium' : 'text-[#737373] hover:text-white'}`}
                >
                  By Epic
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

            {listGroupBy === 'epic' ? (
              listViewEpicGroups.length === 0 ? (
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
                          <div className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                            <span>Title</span>
                            <span>Type</span>
                            <span>Status</span>
                            <span>Priority</span>
                            <span>Points</span>
                            <span>Assignee</span>
                          </div>
                          {/* Table rows with subtask indent */}
                          {group.rows.map(({ item, depth }) => {
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
                                className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                              >
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
                                  <div
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                    style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                  >
                                    <TypeIcon className="w-3 h-3" />
                                    {typeInfo.label}
                                  </div>
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
                                <div className="flex items-center">
                                  <span className="text-xs text-[#737373] truncate">
                                    {item.assignee}
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
                        (isProjectManager(user) ||
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
                        <div className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                          <span>Title</span>
                          <span>Type</span>
                          <span>Status</span>
                          <span>Priority</span>
                          <span>Points</span>
                          <span>Assignee</span>
                        </div>
                        {/* Table rows */}
                        {group.items.map((item) => {
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
                              className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] text-[#E0B954] font-mono font-medium shrink-0">
                                  {item.key}
                                </span>
                                <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">
                                  {item.title}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <div
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                  style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                >
                                  <TypeIcon className="w-3 h-3" />
                                  {typeInfo.label}
                                </div>
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
                              <div className="flex items-center">
                                <span className="text-xs text-[#737373] truncate">
                                  {item.assignee}
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
          onMoveToSprint={handleMoveToSprint}
          onSubmitComment={handleSubmitComment}
          getNextSprint={getNextSprint}
        />
      )}

      {/* Create Item Modal */}
      {showCreateForm && (
        <CreateItemModal
          project={project}
          workItems={workItems}
          existingTags={existingTags}
          parseLocalDate={parseLocalDate}
          isCreatingItem={isCreatingItem}
          onClose={() => setShowCreateForm(false)}
          onSubmit={(form) => createItemMutation.mutate(form)}
        />
      )}

      {/* AI Planning Modal */}
      {showAIModal && (
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
      )}

      {/* Create Sprint Modal */}
      {showCreateSprintModal && (
        <CreateSprintModal
          parseLocalDate={parseLocalDate}
          onClose={() => setShowCreateSprintModal(false)}
          onSubmit={handleCreateSprint}
          disabled={createSprintMutation.isPending}
        />
      )}

      {/* Edit Sprint Modal */}
      {editingSprint && (
        <EditSprintModal
          key={editingSprint.id}
          editingSprint={editingSprint}
          parseLocalDate={parseLocalDate}
          onClose={() => setEditingSprint(null)}
          onSubmit={handleEditSprint}
        />
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

      {/* Reviewer Panel - slide in from right */}
      {showReviewer && (
        <ReviewerPanel
          workItems={workItems}
          projectId={id!}
          token={token!}
          onClose={() => setShowReviewer(false)}
          onTaskUpdate={(itemId, updates) => {
            queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
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
