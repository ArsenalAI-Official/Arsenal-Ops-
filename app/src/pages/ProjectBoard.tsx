import { useState, useEffect, useMemo, useRef, Dispatch, SetStateAction } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TimeEntriesTable from '@/components/TimeEntriesTable';
import TicketContributors from '@/components/TicketContributors';
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
  Save,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  List,
  Layers,
  BarChart3,
  AlertCircle,
  MessageSquare,
  Upload,
  FileText,
  ArrowRight,
  Users,
  GitCommit,
  Inbox,
  Calendar,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ListFilter,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast, Toaster } from 'sonner';
import ArchitectureCard from '@/components/ArchitectureCard';
import ArchitectureEditor from '@/components/ArchitectureEditor';
import { ReviewerView } from '@/components/ProjectHub';
import StatusDotMenu from '@/components/ProjectsPage/StatusDotMenu';
import { useAuth, isProjectManager } from '@/contexts/AuthContext';
import { EpicChip } from '@/components/board/EpicChip';
import { ParentChip } from '@/components/board/ParentChip';
import { WorkItemCombobox } from '@/components/WorkItemCombobox';
import {
  validateReparent,
  getAllowedTargetTypes,
  fieldSupportsType,
} from '@/lib/hierarchy/validateReparent';
import { buildEpicGroups } from '@/lib/hierarchy/buildEpicGroups';
import { apiFetch } from '@/lib/api';

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

interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis: any;
  recommended_tools: any;
  risks: any[];
  timeline: any[];
}

interface GeneratedTicket {
  title: string;
  description: string;
  type: string;
  priority: string;
  story_points: number;
  estimated_hours: number;
  assignee_name: string;
  assignee_id: number | null;
  assignee_reasoning: string;
  tags: string[];
  sprint_number?: number;
  sprint_name?: string;
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

type AIStep = 'upload' | 'analyzing' | 'architectures' | 'preview' | 'committing' | 'done';

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

// Canonical orderings for the sortable list-view columns.
const LIST_SORT_TYPE_ORDER: Record<string, number> = {
  epic: 0,
  user_story: 1,
  task: 2,
  bug: 3,
};
const LIST_SORT_STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  in_review: 3,
  done: 4,
};
const LIST_SORT_PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type ListSortKey = 'type' | 'status' | 'priority' | 'assignee';

const ProjectBoard = () => {
  const { id, ticketId } = useParams<{ id: string; ticketId?: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth(); // token kept for legacy child components (TimeEntriesTable, TicketContributors, ReviewerView)
  const queryClient = useQueryClient();
  const [showReviewer, setShowReviewer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
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

  // Shared sort state for the By Sprint / By Epic list views. Applies within
  // each group; doesn't reorder groups themselves. Null = group's natural
  // order (preserves the parent→child clustering in the By Epic view).
  const [listSortKey, setListSortKey] = useState<ListSortKey | null>(null);
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc');
  const handleListSort = (key: ListSortKey) => {
    if (listSortKey === key) {
      // Same column: asc → desc → off
      if (listSortDir === 'asc') setListSortDir('desc');
      else setListSortKey(null);
    } else {
      setListSortKey(key);
      setListSortDir('asc');
    }
  };
  const listItemComparator = useMemo(() => {
    if (!listSortKey) return null;
    const dir = listSortDir === 'asc' ? 1 : -1;
    return (a: WorkItem, b: WorkItem) => {
      let cmp = 0;
      switch (listSortKey) {
        case 'type':
          cmp = (LIST_SORT_TYPE_ORDER[a.type] ?? 99) - (LIST_SORT_TYPE_ORDER[b.type] ?? 99);
          break;
        case 'status':
          cmp = (LIST_SORT_STATUS_ORDER[a.status] ?? 99) - (LIST_SORT_STATUS_ORDER[b.status] ?? 99);
          break;
        case 'priority':
          cmp =
            (LIST_SORT_PRIORITY_ORDER[a.priority] ?? 99) -
            (LIST_SORT_PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case 'assignee': {
          // Unassigned sorts last in asc, first in desc.
          const aa = a.assignee_id ? (a.assignee || '').toLowerCase() : '￿';
          const bb = b.assignee_id ? (b.assignee || '').toLowerCase() : '￿';
          cmp = aa.localeCompare(bb);
          break;
        }
      }
      return cmp * dir;
    };
  }, [listSortKey, listSortDir]);
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

  // AI Planning flow states
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiStep, setAiStep] = useState<AIStep>('upload');
  const [uploadMode, setUploadMode] = useState<'prd' | 'roadmap'>('prd'); // Toggle between PRD and Roadmap
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [analysis, setAnalysis] = useState<PRDAnalysis | null>(null);
  const [architectures, setArchitectures] = useState<Architecture[]>([]);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<number | null>(null);
  const [editingArchitecture, setEditingArchitecture] = useState<Architecture | null>(null);
  const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);
  const [ticketsSummary, setTicketsSummary] = useState<{
    total_story_points: number;
    total_estimated_hours: number;
    sprint_recommendation: string;
  } | null>(null);
  const [roadmapFile, setRoadmapFile] = useState<File | null>(null);
  const [sprintWeeks, setSprintWeeks] = useState<number>(2);
  const [roadmapSummary, setRoadmapSummary] = useState<any>(null);
  const [roadmapParsedData, setRoadmapParsedData] = useState<any>(null);
  const [createdTicketCount, setCreatedTicketCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sprint and timeline states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState<number | 'all' | 'unassigned'>('all');
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCompletedSprints, setShowCompletedSprints] = useState(false);
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [newSprint, setNewSprint] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [editSprintForm, setEditSprintForm] = useState({
    name: '',
    goal: '',
    start_date: '',
    end_date: '',
  });
  const [deletingSprintId, setDeletingSprintId] = useState<number | null>(null);
  const [completingSprintId, setCompletingSprintId] = useState<number | null>(null);

  // Calendar popover states
  const [showCalendarCreateForm, setShowCalendarCreateForm] = useState(false);
  const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);
  const [showCalendarSprintStart, setShowCalendarSprintStart] = useState(false);
  const [showCalendarSprintEnd, setShowCalendarSprintEnd] = useState(false);
  const [showCalendarEditSprintStart, setShowCalendarEditSprintStart] = useState(false);
  const [showCalendarEditSprintEnd, setShowCalendarEditSprintEnd] = useState(false);

  // Comments UI state only — actual comment data lives in react-query cache
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const [createForm, setCreateForm] = useState({
    type: 'user_story',
    title: '',
    description: '',
    priority: 'medium',
    story_points: 3,
    assignee_id: null as number | null,
    sprint: 'Backlog',
    epic_id: null as number | null,
    parent_id: null as number | null,
    due_date: '' as string,
    estimated_hours: '' as string | number,
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');

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

  // Comments — lazy: only fetches when a ticket is open
  const commentsQuery = useQuery<
    Array<{
      id: number;
      work_item_id: number;
      author_id: number | null;
      author_name: string;
      content: string;
      mentions: number[];
      comment_type: string;
      created_at: string;
      updated_at: string;
    }>
  >({
    queryKey: ['workItem', selectedItem?.id, 'comments'],
    queryFn: () => apiFetch(`/api/comments/workitem/${selectedItem!.id}`),
    enabled: !!selectedItem?.id,
  });
  const comments = commentsQuery.data ?? [];

  // Prefetch comments on hover so data is ready before the drawer opens
  const prefetchComments = (itemId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['workItem', itemId, 'comments'],
      queryFn: () => apiFetch(`/api/comments/workitem/${itemId}`),
    });
  };

  // Derived: reset isEditing when selected ticket changes
  useEffect(() => {
    if (!ticketId) {
      setIsEditing(false);
      setEditForm({});
    }
  }, [ticketId]);

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

  const handleCloseCreateForm = () => {
    setShowCreateForm(false);
    setCreateForm({
      type: 'user_story',
      title: '',
      description: '',
      priority: 'medium',
      story_points: 3,
      assignee_id: null,
      sprint: 'Backlog',
      epic_id: null,
      parent_id: null,
      due_date: '',
      estimated_hours: '',
      tags: [],
    });
    setTagInput('');
  };

  // Create work item mutation
  const createItemMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        type: createForm.type,
        title: createForm.title,
        description: createForm.description,
        priority: createForm.priority,
        story_points: createForm.type !== 'task' ? createForm.story_points : 0,
        assignee_id: createForm.assignee_id,
        project_id: id,
        status: 'todo',
        tags: Array.isArray(createForm.tags) ? createForm.tags : [],
        epic_id: createForm.epic_id || null,
        parent_id: createForm.parent_id || null,
        due_date: createForm.due_date || null,
        estimated_hours: createForm.estimated_hours
          ? parseInt(createForm.estimated_hours as string)
          : 0,
      };
      if (createForm.type !== 'task') {
        payload.assigned_hours = createForm.story_points * 4;
        payload.remaining_hours = createForm.story_points * 4;
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
      handleCloseCreateForm();
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

  const handleCreateItem = () => {
    if (!createForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    createItemMutation.mutate();
  };

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
      setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    },
    onError: () => toast.error('Failed to create sprint'),
  });

  const handleCreateSprint = () => {
    if (createSprintMutation.isPending) return;
    if (!newSprint.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    // Check for duplicate sprint names
    const duplicateName = sprints.some(
      (s) => s.name.trim().toLowerCase() === newSprint.name.trim().toLowerCase(),
    );
    if (duplicateName) {
      toast.error('A sprint with this name already exists');
      return;
    }
    if (!newSprint.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (!newSprint.end_date) {
      toast.error('End date is required');
      return;
    }
    const startDate = parseLocalDate(newSprint.start_date);
    const endDate = parseLocalDate(newSprint.end_date);
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
      name: newSprint.name,
      goal: newSprint.goal,
      start_date: newSprint.start_date || null,
      end_date: newSprint.end_date || null,
    });
  };

  const openEditSprintModal = (sprintKey: string) => {
    const sprint = sprints.find((s) => String(s.id) === sprintKey);
    if (!sprint) return;
    setEditingSprint(sprint);
    setEditSprintForm({
      name: sprint.name,
      goal: sprint.goal || '',
      start_date: sprint.start_date ? sprint.start_date.split('T')[0] : '',
      end_date: sprint.end_date ? sprint.end_date.split('T')[0] : '',
    });
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

  const handleEditSprint = () => {
    if (!editingSprint || !editSprintForm.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    const duplicateName = sprints.some(
      (s) =>
        s.id !== editingSprint.id &&
        s.name.trim().toLowerCase() === editSprintForm.name.trim().toLowerCase(),
    );
    if (duplicateName) {
      toast.error('A sprint with this name already exists');
      return;
    }
    if (!editSprintForm.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (!editSprintForm.end_date) {
      toast.error('End date is required');
      return;
    }
    const startDate = parseLocalDate(editSprintForm.start_date);
    const endDate = parseLocalDate(editSprintForm.end_date);
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
      name: editSprintForm.name,
      goal: editSprintForm.goal,
      start_date: editSprintForm.start_date || null,
      end_date: editSprintForm.end_date || null,
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

  // Handle comment input with @mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);

    // Check for @mentions
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      // Check if there's a space after @ (meaning mention is complete)
      if (!textAfterAt.includes(' ')) {
        setMentionFilter(textAfterAt);
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  // Insert mention
  const insertMention = (developer: { id: number; name: string }) => {
    const lastAtIndex = newComment.lastIndexOf('@');
    const beforeMention = newComment.substring(0, lastAtIndex);
    setNewComment(`${beforeMention}@${developer.name} `);
    setShowMentions(false);
    setMentionFilter('');
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
      setNewComment('');
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
    commentType: 'comment' | 'blocker' | 'business_review' = 'comment',
  ) => {
    if (!selectedItem || !newComment.trim()) return;
    submitCommentMutation.mutate({
      workItemId: selectedItem.id,
      content: newComment,
      authorId: project?.developers?.[0]?.id || 1,
      commentType,
    });
  };

  // Render comment with mentions highlighted and links as clickable
  const renderCommentContent = (content: string, mentions: number[] = []) => {
    // Build a map of developer IDs to names for quick lookup
    const devMap = new Map(allDevelopers.map((d) => [d.id, d.name]));

    // Replace @name with highlighted version for each mentioned developer
    let result = content;
    mentions.forEach((devId) => {
      const devName = devMap.get(devId);
      if (devName) {
        // Replace @devName with highlighted version
        const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        result = result.replace(regex, `<<<MENTION_${devId}>>>`);
      }
    });

    // Also replace URLs with placeholders
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls: string[] = [];
    result = result.replace(urlRegex, (match) => {
      urls.push(match);
      return `<<<URL_${urls.length - 1}>>>`;
    });

    // Parse the result and highlight the placeholders
    const parts = result.split(/(<<<MENTION_\d+>>>|<<<URL_\d+>>>)/g);
    let elementIndex = 0;
    return parts.flatMap((part) => {
      const mentionMatch = part.match(/<<<MENTION_(\d+)>>>/);
      if (mentionMatch) {
        const devId = parseInt(mentionMatch[1]);
        const devName = devMap.get(devId);
        return (
          <span
            key={`mention-${elementIndex++}`}
            className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium"
          >
            @{devName}
          </span>
        );
      }

      const urlMatch = part.match(/<<<URL_(\d+)>>>/);
      if (urlMatch) {
        const urlIndex = parseInt(urlMatch[1]);
        const url = urls[urlIndex];
        return (
          <a
            key={`url-${elementIndex++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all"
          >
            {url}
          </a>
        );
      }

      // Handle newlines in text
      if (part.trim()) {
        return part
          .split('\n')
          .flatMap((line, lineIndex) => [
            <span key={`text-${elementIndex}-${lineIndex}`}>{line}</span>,
            lineIndex < part.split('\n').length - 1 ? (
              <br key={`br-${elementIndex}-${lineIndex}`} />
            ) : null,
          ])
          .filter(Boolean);
      }

      return part;
    });
  };

  // Render text with newlines preserved
  const renderTextWithNewlines = (text: string) => {
    if (!text) return null;
    return text
      .split('\n')
      .map((line, index) => [
        <span key={`line-${index}`}>{line}</span>,
        index < text.split('\n').length - 1 ? <br key={`br-${index}`} /> : null,
      ])
      .flat()
      .filter(Boolean);
  };

  // Depth-1 cap (matches backend services/hierarchy.py): an item that already
  // has a parent cannot itself be picked as a parent — that would create a
  // depth-2 chain. Shared by create form and edit form parent pickers.
  const depth1ParentExclusions = useMemo(() => {
    const excluded = new Set<number>();
    for (const wi of workItems) {
      if (wi.parent_id != null) {
        const n = Number(wi.id);
        if (!Number.isNaN(n)) excluded.add(n);
      }
    }
    return excluded;
  }, [workItems]);

  // Exclude IDs for the edit form's parent_id picker: subject + all
  // descendants (cycle prevention) PLUS any item that's already a child of
  // something else (depth-1 cap).
  const parentExcludeIds = useMemo(() => {
    const excluded = new Set<number>(depth1ParentExclusions);
    if (!selectedItem) return excluded;
    const subjectId = Number(selectedItem.id);
    if (Number.isNaN(subjectId)) return excluded;
    excluded.add(subjectId);
    const childrenByParent = new Map<number, string[]>();
    for (const wi of workItems) {
      if (wi.parent_id != null) {
        const arr = childrenByParent.get(wi.parent_id) ?? [];
        arr.push(wi.id);
        childrenByParent.set(wi.parent_id, arr);
      }
    }
    const queue: number[] = [subjectId];
    while (queue.length) {
      const cur = queue.shift()!;
      const kids = childrenByParent.get(cur) ?? [];
      for (const cid of kids) {
        const cn = Number(cid);
        if (!Number.isNaN(cn) && !excluded.has(cn)) {
          excluded.add(cn);
          queue.push(cn);
        }
      }
    }
    return excluded;
  }, [depth1ParentExclusions, selectedItem, workItems]);

  // Edit form: if the subject already has children, giving it a parent would
  // push them to depth-2. Lock the picker in that case.
  const selectedItemHasChildren = useMemo(() => {
    if (!selectedItem) return false;
    const n = Number(selectedItem.id);
    if (Number.isNaN(n)) return false;
    return workItems.some((wi) => wi.parent_id === n);
  }, [selectedItem, workItems]);

  // For the epic_id picker: epics can't have epics, so only self-exclusion is needed.
  const epicExcludeIds = useMemo(() => {
    const excluded = new Set<number>();
    if (!selectedItem) return excluded;
    const n = Number(selectedItem.id);
    if (!Number.isNaN(n)) excluded.add(n);
    return excluded;
  }, [selectedItem]);

  // Open another item in the detail panel by its numeric id (used by hierarchy chips)
  const openItemByNumericId = (numericId: number | null | undefined) => {
    if (numericId == null) return;
    const target = workItems.find((wi) => wi.id === String(numericId));
    if (!target) {
      toast.error('Referenced item not found');
      return;
    }
    navigate(`/project/${id}/board/${target.id}`);
    setIsEditing(false);
    setEditForm({});
  };

  // Save edited item mutation
  const saveEditMutation = useMutation({
    mutationFn: () =>
      apiFetch<WorkItem>(`/api/workitems/${selectedItem!.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      }),
    onSuccess: (updated) => {
      // Merge: backend may omit fields like due_date; prefer editForm values
      const merged = { ...selectedItem!, ...editForm, ...updated } as WorkItem;
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
        (old ?? []).map((wi) => (wi.id === merged.id ? merged : wi)),
      );
      setIsEditing(false);
      setEditForm({});
      toast.success('Item updated!');
      invalidateWorkItems();
      invalidateProject();
    },
    onError: () => toast.error('Failed to update item'),
  });
  const isSavingEdit = saveEditMutation.isPending;

  const handleSaveEdit = () => {
    if (!selectedItem || isSavingEdit) return;
    saveEditMutation.mutate();
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

  // AI Generate - Open the AI Planning Modal
  const handleAIGenerate = () => {
    setShowAIModal(true);
    setAiStep('upload');
    setUploadMode('prd');
    setPrdFile(null);
    setPrdText('');
    setAdditionalContext('');
    setAnalysis(null);
    setArchitectures([]);
    setSelectedArchitectureId(null);
    setGeneratedTickets([]);
    setTicketsSummary(null);
    setRoadmapFile(null);
    setRoadmapSummary(null);
    setRoadmapParsedData(null);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
      ];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a PDF, Word, or text file');
        return;
      }
      setPrdFile(file);
    }
  };

  // Handle roadmap file upload
  const handleRoadmapFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isExcel =
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls');
      if (!isExcel) {
        toast.error('Please upload an Excel file (.xlsx or .xls)');
        return;
      }
      setRoadmapFile(file);
    }
  };

  // Analyze PRD
  const handleAnalyzePRD = async () => {
    if (!project || (!prdFile && !prdText.trim())) {
      toast.error('Please upload a file or enter PRD content');
      return;
    }

    setAiStep('analyzing');
    setIsGenerating(true);

    try {
      let data: any;
      if (prdFile) {
        // File upload — apiFetch skips Content-Type for FormData
        const formData = new FormData();
        formData.append('file', prdFile);
        formData.append('project_id', String(project.id));
        formData.append('additional_context', additionalContext);
        data = await apiFetch('/api/prd/analyze-file', { method: 'POST', body: formData });
      } else {
        data = await apiFetch('/api/prd/analyze-text', {
          method: 'POST',
          body: JSON.stringify({
            project_id: project.id,
            prd_content: prdText,
            additional_context: additionalContext,
          }),
        });
      }
      setAnalysis(data.analysis);
      setArchitectures(data.architectures);
      setAiStep('architectures');
      toast.success('PRD analyzed successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to analyze PRD');
      setAiStep('upload');
    } finally {
      setIsGenerating(false);
    }
  };

  // Parse Roadmap
  const handleParseRoadmap = async () => {
    if (!project || !roadmapFile) {
      toast.error('Please select a roadmap file');
      return;
    }

    setAiStep('analyzing');
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append('file', roadmapFile);
      formData.append('project_id', String(project.id));
      formData.append('sprint_weeks', String(sprintWeeks));

      const data = await apiFetch<any>('/api/roadmap/parse-file', {
        method: 'POST',
        body: formData,
      });
      setRoadmapSummary(data.summary);
      setRoadmapParsedData(data.parsed_data);
      setAiStep('architectures'); // Reuse architectures step for summary display
      toast.success('Roadmap parsed successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to parse roadmap');
      setAiStep('upload');
    } finally {
      setIsGenerating(false);
    }
  };

  // Select architecture
  const handleSelectArchitecture = async (archId: number) => {
    setSelectedArchitectureId(archId);
    try {
      await apiFetch(`/api/prd/architectures/${archId}/select`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to select architecture:', err);
    }
  };

  // Save architecture edits
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

  // Preview generated tickets
  const handlePreviewTickets = async () => {
    if (!project || !selectedArchitectureId) return;

    setAiStep('preview');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>(`/api/prd/projects/${project.id}/generate-tickets-preview`, {
        method: 'POST',
        body: JSON.stringify({ architecture_id: selectedArchitectureId }),
      });
      setGeneratedTickets(data.tickets);
      setTicketsSummary({
        total_story_points: data.total_story_points,
        total_estimated_hours: data.total_estimated_hours,
        sprint_recommendation: data.sprint_recommendation,
      });
    } catch {
      toast.error('Failed to generate tickets');
      setAiStep('architectures');
    } finally {
      setIsGenerating(false);
    }
  };

  // Commit architecture and create tickets (PRD mode)
  const handleCommitArchitecture = async () => {
    if (!project || !selectedArchitectureId) return;

    setAiStep('committing');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>(`/api/prd/projects/${project.id}/commit-architecture`, {
        method: 'POST',
        body: JSON.stringify({
          architecture_id: selectedArchitectureId,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });

      // Check if AI actually created tickets
      if (!data.success || data.tickets_created === 0) {
        toast.error(data.error || 'AI failed to generate tickets. Existing tickets preserved.');
        setAiStep('preview');
        return;
      }

      setAiStep('done');
      toast.success(
        `Created ${data.tickets_created} tickets${data.sprints?.length ? ` in ${data.sprints.length} sprints` : ''}!`,
      );
      setCreatedTicketCount(data.tickets_created);

      // Invalidate react-query caches so board refreshes automatically
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
      invalidateProject();

      // Close modal after delay
      setTimeout(() => {
        setShowAIModal(false);
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to commit architecture');
      setAiStep('preview');
    } finally {
      setIsGenerating(false);
    }
  };

  // Commit roadmap and create tickets (Roadmap mode)
  const handleCommitRoadmap = async () => {
    if (!project || !roadmapParsedData) return;

    setAiStep('committing');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>('/api/roadmap/commit', {
        method: 'POST',
        body: JSON.stringify({ project_id: project.id, parsed_data: roadmapParsedData }),
      });

      setAiStep('done');
      const sprintMsg = data.sprints_created > 0 ? ` and ${data.sprints_created} sprints` : '';
      toast.success(
        `Created ${data.tickets_created} tasks in ${data.epics_created} epics${sprintMsg}!${data.assignees_not_found > 0 ? ` (${data.assignees_not_found} auto-assigned)` : ''}`,
      );
      setCreatedTicketCount(data.tickets_created);

      // Invalidate react-query caches so board refreshes automatically
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
      invalidateProject();

      // Close modal after delay
      setTimeout(() => {
        setShowAIModal(false);
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to commit roadmap');
      setAiStep('preview');
    } finally {
      setIsGenerating(false);
    }
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
                <div
                  key={status}
                  className={`flex-1 min-w-[280px] max-w-[360px] flex flex-col rounded-2xl border transition-all duration-200 ${
                    isDropTarget
                      ? 'border-[#E0B954]/40 bg-[#E0B954]/5 shadow-lg shadow-[#E0B954]/10'
                      : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                  }`}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  {/* Column Header */}
                  <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: config.color,
                          boxShadow: `0 0 8px ${config.color}44`,
                        }}
                      />
                      <span className="font-semibold text-sm text-white">{config.label}</span>
                    </div>
                    <Badge className="bg-[rgba(255,255,255,0.05)] text-[#737373] border-0 text-xs font-medium px-2 py-0.5">
                      {columnItems.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                    {columnItems.map((item) => {
                      const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                      const TypeIcon = typeInfo.icon;
                      const priorityStyle =
                        PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                      const hoursProgress =
                        item.assigned_hours > 0
                          ? ((item.assigned_hours - item.remaining_hours) / item.assigned_hours) *
                            100
                          : 0;

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => handleDragStart(item.id)}
                          onMouseEnter={() => prefetchComments(item.id)}
                          onClick={() => {
                            navigate(`/project/${id}/board/${item.id}`);
                            setIsEditing(false);
                            setEditForm({});
                          }}
                          className={`group bg-[rgba(255,255,255,0.025)] rounded-xl border border-[rgba(255,255,255,0.05)] p-3.5 cursor-pointer transition-all duration-200 hover:border-[rgba(244,246,255,0.15)] hover:bg-[rgba(244,246,255,0.05)] hover:shadow-lg hover:shadow-black/20 ${
                            draggedItem === item.id ? 'opacity-40 scale-95' : ''
                          }`}
                        >
                          {/* Type + Key */}
                          <div className="flex items-center gap-2 mb-2.5">
                            <div
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                            >
                              <TypeIcon className="w-3 h-3" />
                              {typeInfo.label}
                            </div>
                            <span className="text-[10px] text-[#E0B954] font-mono font-medium">
                              {item.key}
                            </span>
                          </div>

                          {/* Hierarchy chips */}
                          {item.type !== 'epic' && (item.epic_key || item.parent_key) && (
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap min-w-0">
                              {item.epic_key && (
                                <EpicChip
                                  epicKey={item.epic_key}
                                  epicTitle={
                                    workItems.find((wi) => wi.id === String(item.epic_id))?.title
                                  }
                                  onOpen={() => openItemByNumericId(item.epic_id)}
                                />
                              )}
                              {item.parent_key && (
                                <ParentChip
                                  parentKey={item.parent_key}
                                  parentTitle={
                                    workItems.find((wi) => wi.id === String(item.parent_id))?.title
                                  }
                                  onOpen={() => openItemByNumericId(item.parent_id)}
                                />
                              )}
                            </div>
                          )}

                          {/* Title */}
                          <h4 className="text-sm font-medium text-[#f5f5f5] mb-3 line-clamp-2 leading-snug">
                            {item.title}
                          </h4>

                          {/* Progress Bar */}
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-[#737373] mb-1">
                              <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {item.remaining_hours}h left
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-[#E0B954]">
                                  {item.logged_hours || 0}h logged
                                </span>
                                <span>/ {item.assigned_hours}h</span>
                              </span>
                            </div>
                            <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${hoursProgress}%`,
                                  background: `linear-gradient(90deg, ${config.color}, ${config.color}AA)`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Bottom: Points + Priority + Assignee */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-[#E0B954]/15 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-[#E0B954]">
                                  {item.story_points}
                                </span>
                              </div>
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
                            {item.assignee && item.assignee !== 'Unassigned' && (
                              <div
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center"
                                title={item.assignee}
                              >
                                <span className="text-[10px] font-semibold text-white">
                                  {item.assignee?.charAt?.(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Tags */}
                          {item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]"
                                >
                                  {tag}
                                </span>
                              ))}
                              {item.tags.length > 2 && (
                                <span className="text-[9px] text-[#737373]">
                                  +{item.tags.length - 2}
                                </span>
                              )}
                            </div>
                          )}

                          {/* This Week Time Entries Table */}
                          <TimeEntriesTable workItemId={item.id} token={token || ''} />
                        </div>
                      );
                    })}

                    {/* Empty state */}
                    {columnItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-2">
                          <config.icon className="w-5 h-5 text-[#334155]" />
                        </div>
                        <p className="text-xs text-[#334155]">No items</p>
                      </div>
                    )}
                  </div>
                </div>
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
                              setIsEditing(false);
                              setEditForm({});
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
                          <div className="grid grid-cols-[120px_1fr_100px_100px_100px_120px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                            {renderListSortHeader('Type', 'type')}
                            <span>Title</span>
                            {renderListSortHeader('Status', 'status')}
                            {renderListSortHeader('Priority', 'priority')}
                            <span>Points</span>
                            {renderListSortHeader('Assignee', 'assignee')}
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
                                  setIsEditing(false);
                                  setEditForm({});
                                }}
                                className="grid grid-cols-[120px_1fr_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
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
                        <div className="grid grid-cols-[120px_1fr_100px_100px_100px_120px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                          {renderListSortHeader('Type', 'type')}
                          <span>Title</span>
                          {renderListSortHeader('Status', 'status')}
                          {renderListSortHeader('Priority', 'priority')}
                          <span>Points</span>
                          {renderListSortHeader('Assignee', 'assignee')}
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
                                setIsEditing(false);
                                setEditForm({});
                              }}
                              className="grid grid-cols-[120px_1fr_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
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
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => navigate(`/project/${id}/board`)}
          />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-3">
                {(() => {
                  const ti = TYPE_CONFIG[selectedItem.type] || TYPE_CONFIG.task;
                  return (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: ti.bg, color: ti.color }}
                    >
                      <ti.icon className="w-4 h-4" />
                      {ti.label}
                    </div>
                  );
                })()}
                <span className="text-sm text-[#737373] font-mono">{selectedItem.id}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(!isEditing);
                    if (!isEditing) setEditForm(selectedItem);
                  }}
                  className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  {isEditing ? 'Cancel' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteItem(selectedItem.id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg h-8 px-2.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/project/${id}/board`)}
                  className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {isEditing ? (
                /* Edit Form */
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
                    <Input
                      defaultValue={selectedItem.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Description
                    </label>
                    <Textarea
                      defaultValue={selectedItem.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Type
                      </label>
                      <select
                        defaultValue={selectedItem.type}
                        onChange={(e) => {
                          const newType = e.target.value as WorkItem['type'];
                          setEditForm((f) => {
                            const next: Partial<WorkItem> = { ...f, type: newType };
                            if (!fieldSupportsType(newType, 'epic_id')) {
                              next.epic_id = null;
                              next.epic_key = null;
                            }
                            if (!fieldSupportsType(newType, 'parent_id')) {
                              next.parent_id = null;
                              next.parent_key = null;
                            }
                            return next;
                          });
                        }}
                        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                      >
                        <option value="user_story">Story</option>
                        <option value="task">Task</option>
                        <option value="bug">Bug</option>
                        <option value="epic">Epic</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Priority
                      </label>
                      <select
                        defaultValue={selectedItem.priority}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            priority: e.target.value as WorkItem['priority'],
                          }))
                        }
                        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Story Points
                      </label>
                      <Input
                        type="number"
                        defaultValue={selectedItem.story_points}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            story_points: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Allocated Hours
                      </label>
                      <Input
                        type="number"
                        defaultValue={selectedItem.assigned_hours}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            assigned_hours: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Logged Hours
                      </label>
                      <Input
                        type="number"
                        defaultValue={selectedItem.logged_hours || 0}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            logged_hours: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Remaining Hours
                      </label>
                      <Input
                        type="number"
                        defaultValue={selectedItem.remaining_hours}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            remaining_hours: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Assignee
                    </label>
                    <select
                      value={editForm.assignee_id ?? selectedItem.assignee_id ?? ''}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          assignee_id: e.target.value ? parseInt(e.target.value) : null,
                        }))
                      }
                      className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {project?.developers?.map((dev) => (
                        <option key={dev.id} value={dev.id}>
                          {dev.name} ({dev.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  {fieldSupportsType(
                    (editForm.type ?? selectedItem.type) as WorkItem['type'],
                    'epic_id',
                  ) && (
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Epic
                      </label>
                      <WorkItemCombobox
                        value={editForm.epic_id ?? selectedItem.epic_id ?? null}
                        valueKey={editForm.epic_key ?? selectedItem.epic_key ?? null}
                        items={workItems}
                        allowedTypes={getAllowedTargetTypes(
                          (editForm.type ?? selectedItem.type) as WorkItem['type'],
                          'epic_id',
                        )}
                        excludeIds={epicExcludeIds}
                        onChange={(newId, newKey) => {
                          const target =
                            newId != null
                              ? (workItems.find((wi) => wi.id === String(newId)) ?? null)
                              : null;
                          const subjectForValidation = {
                            ...selectedItem,
                            ...editForm,
                            type: (editForm.type ?? selectedItem.type) as WorkItem['type'],
                          };
                          const v = validateReparent(
                            subjectForValidation,
                            target,
                            'epic_id',
                            workItems,
                          );
                          if (!v.ok) {
                            toast.error(v.reason ?? 'Invalid epic');
                            return;
                          }
                          setEditForm((f) => ({ ...f, epic_id: newId, epic_key: newKey }));
                        }}
                        placeholder="No epic"
                      />
                    </div>
                  )}
                  {fieldSupportsType(
                    (editForm.type ?? selectedItem.type) as WorkItem['type'],
                    'parent_id',
                  ) && (
                    <div>
                      <label
                        className="text-xs font-medium text-[#737373] block mb-1.5"
                        title="This task is part of a larger story or task."
                      >
                        Belongs to
                      </label>
                      <WorkItemCombobox
                        value={editForm.parent_id ?? selectedItem.parent_id ?? null}
                        valueKey={editForm.parent_key ?? selectedItem.parent_key ?? null}
                        items={workItems}
                        allowedTypes={getAllowedTargetTypes(
                          (editForm.type ?? selectedItem.type) as WorkItem['type'],
                          'parent_id',
                        )}
                        excludeIds={parentExcludeIds}
                        disabled={selectedItemHasChildren}
                        onChange={(newId, newKey) => {
                          const target =
                            newId != null
                              ? (workItems.find((wi) => wi.id === String(newId)) ?? null)
                              : null;
                          const subjectForValidation = {
                            ...selectedItem,
                            ...editForm,
                            type: (editForm.type ?? selectedItem.type) as WorkItem['type'],
                          };
                          const v = validateReparent(
                            subjectForValidation,
                            target,
                            'parent_id',
                            workItems,
                          );
                          if (!v.ok) {
                            toast.error(v.reason ?? 'Invalid parent');
                            return;
                          }
                          setEditForm((f) => ({ ...f, parent_id: newId, parent_key: newKey }));
                        }}
                        placeholder="No parent"
                      />
                      {selectedItemHasChildren && (
                        <p className="text-[10px] text-[#737373] mt-1.5 leading-snug">
                          This task already has child tasks, so it can’t be nested under another
                          item.
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Sprint
                    </label>
                    <Input
                      defaultValue={selectedItem.sprint}
                      onChange={(e) => setEditForm((f) => ({ ...f, sprint: e.target.value }))}
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Due Date
                      </label>
                      <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
                        <PopoverTrigger asChild>
                          <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                            <Calendar className="w-4 h-4 mr-2" />
                            {editForm.due_date
                              ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString(
                                  'en-US',
                                  { month: 'short', day: 'numeric', year: 'numeric' },
                                )
                              : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                          align="start"
                        >
                          <CalendarIcon
                            mode="single"
                            selected={parseLocalDate(
                              editForm.due_date === '' || !editForm.due_date
                                ? undefined
                                : (editForm.due_date as string),
                            )}
                            onSelect={(date) => {
                              if (date) {
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                setEditForm({ ...editForm, due_date: `${year}-${month}-${day}` });
                                setShowCalendarEditForm(false);
                              }
                            }}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            classNames={{
                              months: 'flex flex-col',
                              month: 'space-y-4',
                              caption:
                                'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                              caption_label: 'text-sm font-medium text-white',
                              nav: 'space-x-1 flex items-center',
                              nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                              nav_button_previous: 'absolute left-0',
                              nav_button_next: 'absolute right-0',
                              table: 'w-full border-collapse space-y-1',
                              head_row: 'flex',
                              head_cell:
                                'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                              row: 'flex w-full gap-1',
                              cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                              day: 'h-8 w-8 p-0 font-normal',
                              day_button:
                                'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                              day_selected:
                                'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                              day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                              day_outside: 'text-[#444]',
                              day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                              day_range_middle:
                                'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                              day_hidden: 'invisible',
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl w-full h-10 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingEdit ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" /> Save Changes
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div>
                    <h2 className="text-xl font-bold text-white mb-3">{selectedItem.title}</h2>
                    <p className="text-sm text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">
                      {renderTextWithNewlines(selectedItem.description) ||
                        'No description provided.'}
                    </p>
                  </div>

                  {/* Detail Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Story Points', value: selectedItem.story_points, color: '#E0B954' },
                      {
                        label: 'Allocated Hours',
                        value: `${selectedItem.assigned_hours}h`,
                        color: '#E0B954',
                      },
                      {
                        label: 'Logged Hours',
                        value: `${selectedItem.logged_hours || 0}h`,
                        color: '#E0B954',
                      },
                      {
                        label: 'Remaining Hours',
                        value: `${selectedItem.remaining_hours}h`,
                        color: '#F59E0B',
                      },
                      {
                        label: 'Due Date',
                        value: selectedItem.due_date
                          ? (parseLocalDate(selectedItem.due_date)?.toLocaleDateString() ??
                            'Not set')
                          : 'Not set',
                        color: selectedItem.due_date ? '#E0B954' : '#737373',
                      },
                      {
                        label: 'Status',
                        value: (STATUS_CONFIG[selectedItem.status] || STATUS_CONFIG.todo).label,
                        color: (STATUS_CONFIG[selectedItem.status] || STATUS_CONFIG.todo).color,
                      },
                      {
                        label: 'Priority',
                        value:
                          selectedItem.priority.charAt(0).toUpperCase() +
                          selectedItem.priority.slice(1),
                        color:
                          selectedItem.priority === 'critical'
                            ? '#EF4444'
                            : selectedItem.priority === 'high'
                              ? '#F97316'
                              : selectedItem.priority === 'medium'
                                ? '#F59E0B'
                                : '#737373',
                      },
                    ].map((d) => (
                      <div
                        key={d.label}
                        className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3.5"
                      >
                        <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wider mb-1">
                          {d.label}
                        </div>
                        <div className="text-lg font-bold" style={{ color: d.color }}>
                          {d.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-3">
                    {[
                      { label: 'Assignee', value: selectedItem.assignee },
                      { label: 'Sprint', value: selectedItem.sprint },
                      ...(selectedItem.epic ? [{ label: 'Epic', value: selectedItem.epic }] : []),
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)]"
                      >
                        <span className="text-xs text-[#737373]">{m.label}</span>
                        <span className="text-sm text-[#f5f5f5]">{m.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Hierarchy: Epic, Belongs to, Child Items — all in the row
                      format used by Child Items, with empty states. */}
                  {(() => {
                    const subjectType = selectedItem.type as WorkItem['type'];
                    const subjectId = parseInt(selectedItem.id);
                    const showEpicSlot = fieldSupportsType(subjectType, 'epic_id');
                    const showParentSlot = fieldSupportsType(subjectType, 'parent_id');
                    // Bug is leaf-only, so don't show a child slot for bugs.
                    const showChildSlot = subjectType !== 'bug';
                    if (!showEpicSlot && !showParentSlot && !showChildSlot) return null;

                    const epicItem = selectedItem.epic_id
                      ? workItems.find((wi) => wi.id === selectedItem.epic_id?.toString())
                      : null;
                    const parentItem = selectedItem.parent_id
                      ? workItems.find((wi) => wi.id === selectedItem.parent_id?.toString())
                      : null;
                    // Epics roll up children via epic_id; everything else via parent_id.
                    const childItems = !showChildSlot
                      ? []
                      : subjectType === 'epic'
                        ? workItems.filter((wi) => wi.epic_id === subjectId)
                        : workItems.filter((wi) => wi.parent_id === subjectId);

                    const renderRow = (target: WorkItem) => (
                      <div
                        key={target.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] cursor-pointer hover:border-[rgba(255,255,255,0.08)] transition-colors"
                        onClick={() => navigate(`/project/${id}/board/${target.id}`)}
                      >
                        <span className="text-xs font-mono text-[#737373] flex-shrink-0">
                          {target.key}
                        </span>
                        <span className="text-sm text-[#a3a3a3] truncate flex-1">
                          {target.title}
                        </span>
                        <span className="text-xs text-[#555] capitalize flex-shrink-0">
                          {target.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    );

                    const renderEmpty = (label: string) => (
                      <div className="flex items-center px-3 py-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.06)] text-xs text-[#555] italic">
                        {label}
                      </div>
                    );

                    return (
                      <div className="space-y-4">
                        {showEpicSlot && (
                          <div>
                            <div className="text-xs text-[#737373] mb-2 font-medium">Epic</div>
                            {epicItem ? renderRow(epicItem) : renderEmpty('No epic')}
                          </div>
                        )}
                        {showParentSlot && (
                          <div>
                            <div className="text-xs text-[#737373] mb-2 font-medium">
                              Belongs to
                            </div>
                            {parentItem ? renderRow(parentItem) : renderEmpty('No parent')}
                          </div>
                        )}
                        {showChildSlot && (
                          <div>
                            <div className="text-xs text-[#737373] mb-2 font-medium">
                              Child Items
                              {childItems.length > 0 ? ` (${childItems.length})` : ''}
                            </div>
                            {childItems.length > 0 ? (
                              <div className="space-y-1.5">{childItems.map(renderRow)}</div>
                            ) : (
                              renderEmpty('No child items')
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tags */}
                  {selectedItem.tags.length > 0 && (
                    <div>
                      <div className="text-xs text-[#737373] mb-2 font-medium">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Log Hours Section */}
                  <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                    <div className="text-xs text-[#737373] mb-3 font-medium">Log Work Hours</div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        placeholder="Hours"
                        min="0"
                        className="w-24 h-9 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                        id="log-hours-input"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const input = document.getElementById(
                            'log-hours-input',
                          ) as HTMLInputElement;
                          const hours = parseInt(input?.value || '0');
                          if (hours > 0) {
                            handleLogHours(selectedItem, hours);
                            input.value = '';
                          }
                        }}
                        className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl h-9"
                      >
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        Log Hours
                      </Button>
                    </div>
                    <p className="text-[10px] text-[#737373] mt-2">
                      Current: {selectedItem.logged_hours || 0}h logged ·{' '}
                      {selectedItem.remaining_hours}h remaining
                    </p>
                  </div>

                  {/* Contributors (only renders when 2+ people have logged hours) */}
                  <TicketContributors workItemId={selectedItem.id} token={token || ''} />

                  {/* Status Buttons */}
                  <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                    <div className="text-xs text-[#737373] mb-3 font-medium">Move to</div>
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(
                        (status) => (
                          <Button
                            key={status}
                            size="sm"
                            onClick={() => handleStatusChange(selectedItem, status)}
                            className={`rounded-lg text-xs h-9 transition-all ${
                              selectedItem.status === status
                                ? 'text-white shadow-lg'
                                : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'
                            }`}
                            style={
                              selectedItem.status === status
                                ? {
                                    backgroundColor: STATUS_CONFIG[status].color,
                                    boxShadow: `0 4px 12px ${STATUS_CONFIG[status].color}33`,
                                  }
                                : {}
                            }
                          >
                            {STATUS_CONFIG[status].label}
                          </Button>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Sprint Movement */}
                  {sprints.length > 0 && (
                    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                      <div className="text-xs text-[#737373] mb-3 font-medium">Sprint Actions</div>
                      <div className="flex flex-wrap gap-2">
                        {/* Move to next sprint */}
                        {selectedItem.sprint_id &&
                          getNextSprint(selectedItem.sprint_id) &&
                          selectedItem.status !== 'done' && (
                            <Button
                              size="sm"
                              onClick={() =>
                                handleMoveToSprint(
                                  selectedItem.id,
                                  getNextSprint(selectedItem.sprint_id),
                                )
                              }
                              className="rounded-lg text-xs h-9 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.2)]"
                            >
                              <ArrowRight className="w-3 h-3 mr-1" />
                              Push to Next Sprint
                            </Button>
                          )}
                        {/* Move to backlog */}
                        {selectedItem.sprint_id && (
                          <Button
                            size="sm"
                            onClick={() => handleMoveToSprint(selectedItem.id, null)}
                            className="rounded-lg text-xs h-9 bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]"
                          >
                            <Inbox className="w-3 h-3 mr-1" />
                            Move to Backlog
                          </Button>
                        )}
                        {/* Move to sprint dropdown */}
                        {!selectedItem.sprint_id && (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleMoveToSprint(selectedItem.id, parseInt(e.target.value));
                                e.target.value = '';
                              }
                            }}
                            className="h-9 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#a3a3a3] rounded-lg px-3 appearance-none cursor-pointer hover:border-[rgba(244,246,255,0.15)]"
                            defaultValue=""
                          >
                            <option value="">Add to Sprint...</option>
                            {sprints.map((sprint) => (
                              <option key={sprint.id} value={sprint.id}>
                                {sprint.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                    <div className="text-xs text-[#737373] mb-3 font-medium">
                      Activity & Comments
                    </div>

                    {/* Comment Input */}
                    <div className="relative mb-4">
                      <Textarea
                        value={newComment}
                        onChange={handleCommentChange}
                        placeholder="Add a comment... Use @ to mention someone"
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none pr-20"
                      />
                      {/* @Mentions Dropdown */}
                      {showMentions && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1D26] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                          {allDevelopers
                            .filter((d) =>
                              d.name.toLowerCase().includes(mentionFilter.toLowerCase()),
                            )
                            .slice(0, 5)
                            .map((dev) => (
                              <button
                                key={dev.id}
                                onClick={() => insertMention(dev)}
                                className="w-full px-3 py-2 text-left text-sm text-[#f5f5f5] hover:bg-[rgba(224,185,84,0.1)] flex items-center gap-2"
                              >
                                <div className="w-6 h-6 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-xs text-[#E0B954]">
                                  {dev.name.charAt(0).toUpperCase()}
                                </div>
                                <span>{dev.name}</span>
                                <span className="text-[#737373] text-xs ml-auto">{dev.email}</span>
                              </button>
                            ))}
                          {allDevelopers.filter((d) =>
                            d.name.toLowerCase().includes(mentionFilter.toLowerCase()),
                          ).length === 0 && (
                            <div className="px-3 py-2 text-sm text-[#737373]">
                              No matching developers
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => handleSubmitComment('comment')}
                          disabled={!newComment.trim()}
                          className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8"
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          Comment
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSubmitComment('blocker')}
                          disabled={!newComment.trim()}
                          className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.2)] rounded-lg text-xs h-8"
                        >
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Report Blocker
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSubmitComment('business_review')}
                          disabled={!newComment.trim()}
                          className="bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)] rounded-lg text-xs h-8"
                        >
                          <Target className="w-3 h-3 mr-1" />
                          Business Review
                        </Button>
                      </div>
                    </div>

                    {/* Comments List */}
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {comments.length === 0 ? (
                        <div className="text-center py-6 text-[#737373] text-sm">
                          No comments yet. Be the first to comment!
                        </div>
                      ) : (
                        comments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`p-3 rounded-xl ${
                              comment.comment_type === 'blocker'
                                ? 'bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)]'
                                : comment.comment_type === 'business_review'
                                  ? 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'
                                  : 'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                  comment.comment_type === 'blocker'
                                    ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]'
                                    : comment.comment_type === 'business_review'
                                      ? 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'
                                      : 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]'
                                }`}
                              >
                                {comment.author_name?.charAt?.(0)?.toUpperCase() || '?'}
                              </div>
                              <span className="text-sm font-medium text-[#f5f5f5]">
                                {comment.author_name}
                              </span>
                              {comment.comment_type === 'blocker' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[rgba(239,68,68,0.2)] text-[#EF4444] text-[10px] font-medium">
                                  BLOCKER
                                </span>
                              )}
                              {comment.comment_type === 'business_review' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[rgba(167,139,250,0.2)] text-[#A78BFA] text-[10px] font-medium">
                                  BUSINESS REVIEW
                                </span>
                              )}
                              <span className="text-xs text-[#737373] ml-auto">
                                {new Date(comment.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-[#a3a3a3] leading-relaxed">
                              {renderCommentContent(comment.content, comment.mentions)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Item Modal */}
      {showCreateForm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => handleCloseCreateForm()}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Create Work Item</h2>
              <button
                onClick={() => handleCloseCreateForm()}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
                <select
                  value={createForm.type}
                  onChange={(e) => {
                    const newType = e.target.value as WorkItem['type'];
                    setCreateForm((f) => ({
                      ...f,
                      type: newType,
                      epic_id: fieldSupportsType(newType, 'epic_id') ? f.epic_id : null,
                      parent_id: fieldSupportsType(newType, 'parent_id') ? f.parent_id : null,
                    }));
                  }}
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                >
                  <option value="user_story">User Story</option>
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                  <option value="epic">Epic</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Title *</label>
                <Input
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Enter a concise title..."
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Description
                </label>
                <Textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the requirements..."
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none whitespace-pre-wrap"
                />
              </div>
              <div
                className={
                  createForm.type === 'task' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'
                }
              >
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Priority
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                {createForm.type !== 'task' && (
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Points
                    </label>
                    <Input
                      type="number"
                      value={createForm.story_points}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          story_points: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Assignee
                  </label>
                  <select
                    value={createForm.assignee_id || ''}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        assignee_id: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                    className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {project?.developers?.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} ({dev.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {(fieldSupportsType(createForm.type as WorkItem['type'], 'epic_id') ||
                fieldSupportsType(createForm.type as WorkItem['type'], 'parent_id')) && (
                <div className="grid grid-cols-2 gap-3">
                  {fieldSupportsType(createForm.type as WorkItem['type'], 'epic_id') && (
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Epic (optional)
                      </label>
                      <WorkItemCombobox
                        value={createForm.epic_id}
                        valueKey={null}
                        items={workItems}
                        allowedTypes={getAllowedTargetTypes(
                          createForm.type as WorkItem['type'],
                          'epic_id',
                        )}
                        onChange={(newId) => setCreateForm((f) => ({ ...f, epic_id: newId }))}
                        placeholder="No epic"
                      />
                    </div>
                  )}
                  {fieldSupportsType(createForm.type as WorkItem['type'], 'parent_id') && (
                    <div>
                      <label
                        className="text-xs font-medium text-[#737373] block mb-1.5"
                        title="This task is part of a larger story or task."
                      >
                        Belongs to (optional)
                      </label>
                      <WorkItemCombobox
                        value={createForm.parent_id}
                        valueKey={null}
                        items={workItems}
                        allowedTypes={getAllowedTargetTypes(
                          createForm.type as WorkItem['type'],
                          'parent_id',
                        )}
                        excludeIds={depth1ParentExclusions}
                        onChange={(newId) => setCreateForm((f) => ({ ...f, parent_id: newId }))}
                        placeholder="No parent"
                      />
                    </div>
                  )}
                </div>
              )}
              {createForm.type === 'task' && (
                /* Tags section for Tasks */
                <div className="p-3 rounded-lg bg-[rgba(224,185,84,0.08)] border border-[rgba(224,185,84,0.2)]">
                  <label className="text-xs font-medium text-[#E0B954] block mb-1.5">
                    Tags (Optional)
                  </label>
                  <p className="text-[10px] text-[#737373] mb-2">
                    Organize tasks with tags. Type a new tag or select from existing ones.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault();
                          const newTag = tagInput.trim().toLowerCase();
                          if (!createForm.tags?.includes(newTag)) {
                            setCreateForm((f) => {
                              const updatedTags = [...(f.tags || []), newTag];
                              return { ...f, tags: updatedTags };
                            });
                          }
                          setTagInput('');
                        }
                      }}
                      placeholder="Type tag and press Enter"
                      className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 placeholder:text-[#334155] focus:outline-none focus:border-[#E0B954]/50"
                    />
                  </div>
                  {/* Suggested existing tags */}
                  {existingTags.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] text-[#E0B954] font-medium mb-1.5">
                        Available Tags ({existingTags.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {existingTags
                          .filter((t) => !createForm.tags?.includes(t))
                          .map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                setCreateForm((f) => {
                                  const updated = [...(f.tags || []), tag];
                                  return { ...f, tags: updated };
                                });
                              }}
                              className="px-3 py-1 rounded-lg bg-[rgba(224,185,84,0.15)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs hover:bg-[rgba(224,185,84,0.25)] transition-colors cursor-pointer font-medium"
                            >
                              + {tag}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  {existingTags.length === 0 && (
                    <div className="mb-2 p-2 rounded bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.15)]">
                      <p className="text-[10px] text-[#737373]">
                        No existing tags yet. Create new ones by typing and pressing Enter!
                      </p>
                    </div>
                  )}
                  {/* Selected tags */}
                  {createForm.tags && createForm.tags.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#737373] mb-1.5 font-medium">
                        Selected Tags ({createForm.tags.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {createForm.tags.map((tag) => (
                          <div
                            key={tag}
                            className="px-2.5 py-1 rounded-lg bg-[rgba(224,185,84,0.2)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs flex items-center gap-1.5 font-medium"
                          >
                            {tag}
                            <button
                              onClick={() => {
                                setCreateForm((f) => {
                                  const updated = f.tags?.filter((t) => t !== tag) || [];
                                  return { ...f, tags: updated };
                                });
                              }}
                              className="text-[#E0B954] hover:text-white ml-0.5"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Due Date and Estimated Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Due Date (optional)
                  </label>
                  <Popover open={showCalendarCreateForm} onOpenChange={setShowCalendarCreateForm}>
                    <PopoverTrigger asChild>
                      <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                        <Calendar className="w-4 h-4 mr-2" />
                        {createForm.due_date
                          ? parseLocalDate(createForm.due_date as string)?.toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric', year: 'numeric' },
                            )
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                      align="start"
                    >
                      <CalendarIcon
                        mode="single"
                        selected={parseLocalDate(
                          createForm.due_date === '' ? undefined : (createForm.due_date as string),
                        )}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            setCreateForm({ ...createForm, due_date: `${year}-${month}-${day}` });
                            setShowCalendarCreateForm(false);
                          }
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        classNames={{
                          months: 'flex flex-col',
                          month: 'space-y-4',
                          caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                          caption_label: 'text-sm font-medium text-white',
                          nav: 'space-x-1 flex items-center',
                          nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                          nav_button_previous: 'absolute left-0',
                          nav_button_next: 'absolute right-0',
                          table: 'w-full border-collapse space-y-1',
                          head_row: 'flex',
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Est. Hours
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={createForm.estimated_hours}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, estimated_hours: e.target.value }))
                    }
                    placeholder="Hours"
                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
              <Button
                variant="ghost"
                onClick={() => handleCloseCreateForm()}
                className="text-[#737373] rounded-xl px-5"
                disabled={isCreatingItem}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateItem}
                disabled={!createForm.title.trim() || isCreatingItem}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                title={!createForm.title.trim() ? 'Title is required' : ''}
              >
                {isCreatingItem ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> Create Item
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Planning Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Project Planning</h2>
                  <p className="text-xs text-[#737373]">
                    {aiStep === 'upload' && 'Upload PRD or enter project details'}
                    {aiStep === 'analyzing' && 'Analyzing project requirements...'}
                    {aiStep === 'architectures' && 'Select your preferred architecture'}
                    {aiStep === 'preview' && 'Review generated tickets'}
                    {aiStep === 'committing' && 'Creating tickets...'}
                    {aiStep === 'done' && 'Tickets created successfully!'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAIModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Step: Upload */}
              {aiStep === 'upload' && (
                <div className="space-y-6">
                  {/* Upload Mode Toggle */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setUploadMode('prd')}
                      className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                        uploadMode === 'prd'
                          ? 'bg-[#E0B954] text-black'
                          : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
                      }`}
                    >
                      PRD Document
                    </button>
                    <button
                      onClick={() => setUploadMode('roadmap')}
                      className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                        uploadMode === 'roadmap'
                          ? 'bg-[#E0B954] text-black'
                          : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
                      }`}
                    >
                      Roadmap File
                    </button>
                  </div>

                  {/* PRD Mode */}
                  {uploadMode === 'prd' && (
                    <div className="space-y-6">
                      <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                        Upload PRD Document
                      </label>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                          prdFile
                            ? 'border-[#E0B954] bg-[#E0B954]/5'
                            : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        {prdFile ? (
                          <div className="flex items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                              <FileText className="w-6 h-6 text-[#E0B954]" />
                            </div>
                            <div className="text-left">
                              <p className="text-white font-medium">{prdFile.name}</p>
                              <p className="text-xs text-[#737373]">
                                {(prdFile.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrdFile(null);
                              }}
                              className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-red-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-[#737373] mx-auto mb-3" />
                            <p className="text-[#a3a3a3] mb-1">Click to upload or drag and drop</p>
                            <p className="text-xs text-[#737373]">PDF, Word, or Text files</p>
                          </>
                        )}
                      </div>

                      {/* OR Divider */}
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
                        <span className="text-xs text-[#737373] font-medium">OR</span>
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
                      </div>

                      {/* Text Input */}
                      <div>
                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                          Enter PRD Content Manually
                        </label>
                        <Textarea
                          value={prdText}
                          onChange={(e) => setPrdText(e.target.value)}
                          placeholder="Describe your project requirements, features, user stories, technical specifications..."
                          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[180px] placeholder:text-[#334155] resize-none"
                        />
                      </div>

                      {/* Additional Context */}
                      <div>
                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                          Additional Context (Optional)
                        </label>
                        <Textarea
                          value={additionalContext}
                          onChange={(e) => setAdditionalContext(e.target.value)}
                          placeholder="Budget constraints, team size, timeline, preferred technologies, existing infrastructure..."
                          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none"
                        />
                      </div>

                      {/* Timeline */}
                      <div>
                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                          <Calendar className="w-4 h-4 inline mr-2" />
                          Project Timeline (Optional)
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-[#737373] block mb-1.5">
                              Start Date
                            </label>
                            <Input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#737373] block mb-1.5">End Date</label>
                            <Input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                            />
                          </div>
                        </div>
                        {startDate && endDate && (
                          <p className="text-xs text-[#737373] mt-2">
                            {Math.ceil(
                              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                                (1000 * 60 * 60 * 24 * 7),
                            )}{' '}
                            weeks = ~
                            {Math.max(
                              1,
                              Math.ceil(
                                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                                  (1000 * 60 * 60 * 24 * 14),
                              ),
                            )}{' '}
                            sprints (2-week each)
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {uploadMode === 'roadmap' && (
                    <div className="space-y-6">
                      <div>
                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                          Weeks per Sprint
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="1"
                            max="6"
                            value={sprintWeeks}
                            onChange={(e) => setSprintWeeks(parseInt(e.target.value))}
                            className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, #E0B954 0%, #E0B954 ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) 100%)`,
                            }}
                          />
                          <div className="w-16 h-10 bg-[rgba(224,185,84,0.15)] border border-[#E0B954]/30 rounded-lg flex items-center justify-center">
                            <span className="text-sm font-semibold text-[#E0B954]">
                              {sprintWeeks} weeks
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-[#737373] mt-2">
                          This will help determine how sprints are created from your roadmap
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                          Upload Roadmap File
                        </label>
                        <div
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.xlsx,.xls';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file)
                                handleRoadmapFileUpload({ target: { files: [file] } } as any);
                            };
                            input.click();
                          }}
                          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                            roadmapFile
                              ? 'border-[#E0B954] bg-[#E0B954]/5'
                              : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
                          }`}
                        >
                          {roadmapFile ? (
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#E0B954]" />
                              </div>
                              <div className="text-left">
                                <p className="text-white font-medium">{roadmapFile.name}</p>
                                <p className="text-xs text-[#737373]">
                                  {(roadmapFile.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRoadmapFile(null);
                                }}
                                className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-red-400"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-[#737373] mx-auto mb-3" />
                              <p className="text-[#a3a3a3] mb-1">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-[#737373]">Excel files (.xlsx, .xls)</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="bg-[rgba(102,184,255,0.1)] border border-[rgba(102,184,255,0.3)] rounded-xl p-4">
                        <p className="text-xs text-[#66b8ff] flex gap-2 items-start">
                          <span className="mt-0.5">ℹ️</span>
                          <span>
                            Roadmap file should contain tables with columns: Type, Name,
                            Description, Milestone, Epic, Priority, Effort, Assignee, and Weekly
                            hours.
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Analyzing */}
              {aiStep === 'analyzing' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6 animate-pulse">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="w-12 h-12 border-3 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    AI is analyzing your project
                  </h3>
                  <p className="text-[#737373] text-center max-w-md">
                    Performing cost analysis, recommending tools, and generating architecture
                    options...
                  </p>
                </div>
              )}

              {/* Step: Architecture Selection / Roadmap Summary */}
              {aiStep === 'architectures' && (
                <div className="space-y-6">
                  {/* PRD Analysis Summary */}
                  {analysis && (
                    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-[#E0B954]" />
                        PRD Analysis Summary
                      </h3>
                      <p className="text-sm text-[#a3a3a3] mb-4">{analysis.summary}</p>

                      {analysis.key_features && analysis.key_features.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-[#737373] font-medium mb-2">Key Features</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.key_features.slice(0, 6).map((feature, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded-lg bg-[#E0B954]/10 text-[#E0B954] text-xs"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.recommended_tools && (
                        <div>
                          <p className="text-xs text-[#737373] font-medium mb-2">
                            Recommended Tools
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(analysis.recommended_tools)
                              .slice(0, 6)
                              .map(([category, tool]) => (
                                <span
                                  key={category}
                                  className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
                                >
                                  {category}: {String(tool)}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Roadmap Summary */}
                  {roadmapSummary && (
                    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Target className="w-4 h-4 text-[#E0B954]" />
                        Roadmap Summary
                      </h3>

                      {/* Key Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Epics</p>
                          <p className="text-lg font-bold text-[#66b8ff]">
                            {roadmapSummary.total_epics}
                          </p>
                        </div>
                        <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Tasks</p>
                          <p className="text-lg font-bold text-[#E0B954]">
                            {roadmapSummary.total_tasks}
                          </p>
                        </div>
                        <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Team Size</p>
                          <p className="text-lg font-bold text-[#10b981]">
                            {roadmapSummary.total_assignees}
                          </p>
                        </div>
                        <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Duration</p>
                          <p className="text-lg font-bold text-[#F59E0B]">
                            {roadmapSummary.timeline.duration_weeks}w
                          </p>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                        <p className="text-xs font-medium text-[#737373] mb-2">Timeline</p>
                        <p className="text-sm text-[#a3a3a3]">
                          {roadmapSummary.timeline.start} → {roadmapSummary.timeline.end}
                        </p>
                      </div>

                      {/* Team Members */}
                      {roadmapSummary.assignees && roadmapSummary.assignees.length > 0 && (
                        <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                          <p className="text-xs font-medium text-[#737373] mb-2">Team Members</p>
                          <div className="flex flex-wrap gap-2">
                            {roadmapSummary.assignees.map((assignee: string, i: number) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
                              >
                                {assignee}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Warnings */}
                      {roadmapSummary.warnings && roadmapSummary.warnings.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-[#f59e0b] mb-2">
                            ⚠️ Warnings ({roadmapSummary.warnings.length})
                          </p>
                          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                            {roadmapSummary.warnings.map((warning: any, i: number) => (
                              <div
                                key={i}
                                className="text-xs text-[#737373] bg-[rgba(245,158,11,0.08)] p-2 rounded"
                              >
                                <p className="font-medium text-[#f59e0b]">{warning.issue}</p>
                                <p className="text-xs">
                                  {warning.task}: {warning.detail}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Conflicts */}
                      {roadmapSummary.conflicts && roadmapSummary.conflicts.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-[#ef4444] mb-2">
                            🔴 Conflicts ({roadmapSummary.conflicts.length})
                          </p>
                          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                            {roadmapSummary.conflicts.map((conflict: any, i: number) => (
                              <div
                                key={i}
                                className="text-xs text-[#737373] bg-[rgba(239,68,68,0.08)] p-2 rounded"
                              >
                                <p className="font-medium text-[#ef4444]">
                                  {conflict.assignee} - Week {conflict.week}
                                </p>
                                <p>
                                  {conflict.total_hrs}h scheduled (tasks:{' '}
                                  {conflict.tasks.join(', ')})
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Architecture Cards (PRD Mode) */}
                  {!roadmapSummary && (
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-4">Select Architecture</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {architectures.map((arch) => (
                          <ArchitectureCard
                            key={arch.id}
                            architecture={arch}
                            isSelected={selectedArchitectureId === arch.id}
                            onSelect={() => handleSelectArchitecture(arch.id)}
                            onViewFullScreen={() => setEditingArchitecture(arch)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Preview Tickets */}
              {aiStep === 'preview' && (
                <div className="space-y-6">
                  {/* PRD Mode - Summary Stats */}
                  {uploadMode === 'prd' && ticketsSummary && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#E0B954]">
                          {generatedTickets.length}
                        </p>
                        <p className="text-xs text-[#737373]">Tickets</p>
                      </div>
                      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#F59E0B]">
                          {ticketsSummary.total_story_points}
                        </p>
                        <p className="text-xs text-[#737373]">Total Points</p>
                      </div>
                      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#E0B954]">
                          {ticketsSummary.total_estimated_hours}h
                        </p>
                        <p className="text-xs text-[#737373]">Estimated Hours</p>
                      </div>
                    </div>
                  )}

                  {/* Roadmap Mode - Summary Stats */}
                  {uploadMode === 'roadmap' && roadmapSummary && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Epics</p>
                          <p className="text-lg font-bold text-[#66b8ff]">
                            {roadmapSummary.total_epics}
                          </p>
                        </div>
                        <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Tasks</p>
                          <p className="text-lg font-bold text-[#E0B954]">
                            {roadmapSummary.total_tasks}
                          </p>
                        </div>
                        <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Team Size</p>
                          <p className="text-lg font-bold text-[#10b981]">
                            {roadmapSummary.total_assignees}
                          </p>
                        </div>
                        <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                          <p className="text-xs text-[#737373] mb-1">Duration</p>
                          <p className="text-lg font-bold text-[#F59E0B]">
                            {roadmapSummary.timeline?.duration_weeks || '?'}w
                          </p>
                        </div>
                      </div>

                      {/* Sprint Info */}
                      {roadmapSummary.total_sprints !== undefined && (
                        <div className="bg-[rgba(224,185,84,0.1)] border border-[#E0B954]/20 rounded-xl p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                              <BarChart3 className="w-5 h-5 text-[#E0B954]" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">Sprint Plan</p>
                              <p className="text-xs text-[#737373]">
                                {sprintWeeks} weeks per sprint
                              </p>
                            </div>
                          </div>
                          <p className="text-2xl font-bold text-[#E0B954] mb-1">
                            {roadmapSummary.total_sprints} Sprints
                          </p>
                          <p className="text-xs text-[#a3a3a3]">
                            Will be created with {sprintWeeks}-week cycles
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Sprint Recommendation (PRD only) */}
                  {uploadMode === 'prd' && ticketsSummary?.sprint_recommendation && (
                    <div className="bg-[#E0B954]/10 border border-[#E0B954]/20 rounded-xl p-4">
                      <p className="text-sm text-[#E0B954] font-medium">Sprint Recommendation</p>
                      <p className="text-xs text-[#a3a3a3] mt-1">
                        {ticketsSummary.sprint_recommendation}
                      </p>
                    </div>
                  )}

                  {/* Tickets List - PRD Mode */}
                  {uploadMode === 'prd' && (
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                        Generated Tickets ({generatedTickets.length})
                      </h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {generatedTickets.length === 0 ? (
                          <div className="text-center py-8 text-[#737373]">
                            <p>No tickets generated. Please try again.</p>
                          </div>
                        ) : (
                          generatedTickets.map((ticket, index) => {
                            const typeInfo =
                              TYPE_CONFIG[ticket.type as keyof typeof TYPE_CONFIG] ||
                              TYPE_CONFIG.task;
                            const TypeIcon = typeInfo.icon;
                            return (
                              <div
                                key={index}
                                className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                        style={{
                                          backgroundColor: typeInfo.bg,
                                          color: typeInfo.color,
                                        }}
                                      >
                                        <TypeIcon className="w-3 h-3" />
                                        {typeInfo.label}
                                      </div>
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                        style={{
                                          backgroundColor:
                                            (
                                              PRIORITY_COLORS[
                                                ticket.priority as keyof typeof PRIORITY_COLORS
                                              ] || PRIORITY_COLORS.low
                                            ).hex + '33',
                                          color: (
                                            PRIORITY_COLORS[
                                              ticket.priority as keyof typeof PRIORITY_COLORS
                                            ] || PRIORITY_COLORS.low
                                          ).hex,
                                        }}
                                      >
                                        {ticket.priority.charAt(0).toUpperCase() +
                                          ticket.priority.slice(1)}
                                      </span>
                                    </div>
                                    <h4 className="text-sm font-medium text-white mb-1">
                                      {ticket.title}
                                    </h4>
                                    <p className="text-xs text-[#737373] line-clamp-2">
                                      {ticket.description}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-[#737373]">
                                        {ticket.story_points} pts
                                      </span>
                                      <span className="text-xs text-[#737373]">
                                        {ticket.estimated_hours}h
                                      </span>
                                    </div>
                                    {ticket.assignee_name && (
                                      <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                        <Users className="w-3 h-3 text-[#E0B954]" />
                                        <span className="text-xs text-[#a3a3a3]">
                                          {ticket.assignee_name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {ticket.assignee_reasoning && (
                                  <p className="text-[10px] text-[#737373] mt-2 italic">
                                    Assignment: {ticket.assignee_reasoning}
                                  </p>
                                )}
                                {ticket.tags && ticket.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {ticket.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-[10px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tickets List - Roadmap Mode */}
                  {uploadMode === 'roadmap' && roadmapParsedData && (
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                        Roadmap Tickets ({roadmapParsedData.tickets?.length || 0})
                      </h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {!roadmapParsedData.tickets || roadmapParsedData.tickets.length === 0 ? (
                          <div className="text-center py-8 text-[#737373]">
                            <p>No tickets found in roadmap.</p>
                          </div>
                        ) : (
                          roadmapParsedData.tickets.map((ticket: any, index: number) => (
                            <div
                              key={index}
                              className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className="text-[10px] bg-[#E0B954]/20 text-[#E0B954] border-0">
                                      {ticket.priority || 'medium'}
                                    </Badge>
                                  </div>
                                  <h4 className="text-sm font-medium text-white mb-1">
                                    {ticket.name}
                                  </h4>
                                  <p className="text-xs text-[#737373] line-clamp-2">
                                    {ticket.description || 'No description'}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                  <span className="text-xs text-[#737373]">
                                    {ticket.effort_hrs || 0}h
                                  </span>
                                  {ticket.assignee && (
                                    <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                      <Users className="w-3 h-3 text-[#E0B954]" />
                                      <span className="text-xs text-[#a3a3a3]">
                                        {ticket.assignee}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {ticket.milestone && (
                                <p className="text-[10px] text-[#737373] mt-2">
                                  Milestone: {ticket.milestone}
                                </p>
                              )}
                              {ticket.epic && (
                                <p className="text-[10px] text-[#737373]">Epic: {ticket.epic}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Committing */}
              {aiStep === 'committing' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6">
                    <GitCommit className="w-8 h-8 text-white" />
                  </div>
                  <div className="w-12 h-12 border-3 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-2">Creating Tickets</h3>
                  <p className="text-[#737373] text-center max-w-md">
                    Adding tickets to your board and assigning to team members...
                  </p>
                </div>
              )}

              {/* Step: Done */}
              {aiStep === 'done' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-20 h-20 rounded-full bg-[#E0B954]/20 flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-10 h-10 text-[#E0B954]" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">All Done!</h3>
                  <p className="text-[#a3a3a3] mb-6">
                    <span className="text-2xl font-bold text-[#E0B954]">{createdTicketCount}</span>{' '}
                    tickets created successfully
                  </p>
                  <Button
                    onClick={() => setShowAIModal(false)}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-8"
                  >
                    View Board
                  </Button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {(aiStep === 'upload' || aiStep === 'architectures' || aiStep === 'preview') && (
              <div className="flex items-center justify-between p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (aiStep === 'architectures') setAiStep('upload');
                    else if (aiStep === 'preview') setAiStep('architectures');
                    else setShowAIModal(false);
                  }}
                  className="text-[#737373] rounded-xl"
                >
                  {aiStep === 'upload' ? 'Cancel' : 'Back'}
                </Button>

                {aiStep === 'upload' && (
                  <>
                    {uploadMode === 'prd' && (
                      <Button
                        onClick={handleAnalyzePRD}
                        disabled={!prdFile && !prdText.trim()}
                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Analyze PRD
                      </Button>
                    )}
                    {uploadMode === 'roadmap' && (
                      <Button
                        onClick={handleParseRoadmap}
                        disabled={!roadmapFile}
                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Parse Roadmap
                      </Button>
                    )}
                  </>
                )}

                {aiStep === 'architectures' && (
                  <>
                    {uploadMode === 'prd' ? (
                      <Button
                        onClick={handlePreviewTickets}
                        disabled={!selectedArchitectureId}
                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Preview Tickets
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setAiStep('preview')}
                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Create Tickets from Roadmap
                      </Button>
                    )}
                  </>
                )}

                {aiStep === 'preview' && (
                  <Button
                    onClick={uploadMode === 'prd' ? handleCommitArchitecture : handleCommitRoadmap}
                    className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#E0B954]/20"
                  >
                    <GitCommit className="w-4 h-4 mr-2" />
                    {uploadMode === 'prd'
                      ? 'Commit & Create Tickets'
                      : 'Create Tickets from Roadmap'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Sprint Modal */}
      {showCreateSprintModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCreateSprintModal(false);
            setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
          }}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Create New Sprint</h2>
              <button
                onClick={() => {
                  setShowCreateSprintModal(false);
                  setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
                }}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Sprint Name *
                </label>
                <Input
                  value={newSprint.name}
                  onChange={(e) => setNewSprint((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Sprint 1: Foundation"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Sprint Goal
                </label>
                <Textarea
                  value={newSprint.goal}
                  onChange={(e) => setNewSprint((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="What do we want to achieve in this sprint?"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Start Date *
                  </label>
                  <Popover open={showCalendarSprintStart} onOpenChange={setShowCalendarSprintStart}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                          !newSprint.start_date ? 'text-[#737373]' : ''
                        }`}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {newSprint.start_date
                          ? parseLocalDate(newSprint.start_date)?.toLocaleDateString()
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                    >
                      <CalendarIcon
                        mode="single"
                        selected={parseLocalDate(newSprint.start_date)}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const localDate = `${year}-${month}-${day}`;
                            setNewSprint((f) => ({ ...f, start_date: localDate }));
                            setShowCalendarSprintStart(false);
                          }
                        }}
                        classNames={{
                          months: 'flex flex-col',
                          month: 'space-y-4',
                          caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                          caption_label: 'text-sm font-medium text-white',
                          nav: 'space-x-1 flex items-center',
                          nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                          nav_button_previous: 'absolute left-0',
                          nav_button_next: 'absolute right-0',
                          table: 'w-full border-collapse space-y-1',
                          head_row: 'flex',
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    End Date *
                  </label>
                  <Popover
                    open={showCalendarSprintEnd && !!newSprint.start_date}
                    onOpenChange={(open) => newSprint.start_date && setShowCalendarSprintEnd(open)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!newSprint.start_date}
                        className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                          !newSprint.end_date ? 'text-[#737373]' : ''
                        } ${!newSprint.start_date ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={!newSprint.start_date ? 'Set start date first' : ''}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {newSprint.end_date
                          ? parseLocalDate(newSprint.end_date)?.toLocaleDateString()
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                    >
                      <div className="mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                        <p className="text-[10px] text-[#737373] font-medium uppercase mb-1.5">
                          Sprint Duration
                        </p>
                        <div className="space-y-1">
                          <p className="text-xs text-[#737373]">
                            Start:{' '}
                            <span className="text-[#E0B954] font-medium">
                              {parseLocalDate(newSprint.start_date)?.toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </p>
                          <p className="text-xs text-[#737373]">
                            End: <span className="text-white font-medium">Pick a date</span>
                          </p>
                        </div>
                      </div>
                      <CalendarIcon
                        mode="single"
                        month={parseLocalDate(newSprint.start_date) || new Date()}
                        selected={parseLocalDate(newSprint.end_date)}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const localDate = `${year}-${month}-${day}`;
                            setNewSprint((f) => ({ ...f, end_date: localDate }));
                            setShowCalendarSprintEnd(false);
                          }
                        }}
                        disabled={(date) =>
                          newSprint.start_date
                            ? date < parseLocalDate(newSprint.start_date)!
                            : false
                        }
                        classNames={{
                          months: 'flex flex-col',
                          month: 'space-y-4',
                          caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                          caption_label: 'text-sm font-medium text-white',
                          nav: 'space-x-1 flex items-center',
                          nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                          nav_button_previous: 'absolute left-0',
                          nav_button_next: 'absolute right-0',
                          table: 'w-full border-collapse space-y-1',
                          head_row: 'flex',
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateSprintModal(false);
                  setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
                }}
                className="text-[#737373] rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSprint}
                disabled={!newSprint.name.trim() || !newSprint.start_date || !newSprint.end_date}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                title={
                  !newSprint.start_date || !newSprint.end_date
                    ? 'Start and End dates are required'
                    : ''
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Sprint
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sprint Modal */}
      {editingSprint && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setEditingSprint(null)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-lg font-bold text-white">Edit Sprint</h2>
              <button
                onClick={() => setEditingSprint(null)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Sprint Name *
                </label>
                <Input
                  value={editSprintForm.name}
                  onChange={(e) => setEditSprintForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Sprint 1: Foundation"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Sprint Goal
                </label>
                <Textarea
                  value={editSprintForm.goal}
                  onChange={(e) => setEditSprintForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="What do we want to achieve in this sprint?"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Start Date *
                  </label>
                  <Popover
                    open={showCalendarEditSprintStart}
                    onOpenChange={setShowCalendarEditSprintStart}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${!editSprintForm.start_date ? 'text-[#737373]' : ''}`}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {editSprintForm.start_date
                          ? parseLocalDate(editSprintForm.start_date)?.toLocaleDateString()
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                    >
                      <CalendarIcon
                        mode="single"
                        selected={parseLocalDate(editSprintForm.start_date)}
                        onSelect={(date) => {
                          if (date) {
                            const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            setEditSprintForm((f) => ({ ...f, start_date: localDate }));
                            setShowCalendarEditSprintStart(false);
                          }
                        }}
                        classNames={{
                          months: 'flex flex-col',
                          month: 'space-y-4',
                          caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                          caption_label: 'text-sm font-medium text-white',
                          nav: 'space-x-1 flex items-center',
                          nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                          nav_button_previous: 'absolute left-0',
                          nav_button_next: 'absolute right-0',
                          table: 'w-full border-collapse space-y-1',
                          head_row: 'flex',
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    End Date *
                  </label>
                  <Popover
                    open={showCalendarEditSprintEnd && !!editSprintForm.start_date}
                    onOpenChange={(open) =>
                      editSprintForm.start_date && setShowCalendarEditSprintEnd(open)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!editSprintForm.start_date}
                        className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${!editSprintForm.end_date ? 'text-[#737373]' : ''} ${!editSprintForm.start_date ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {editSprintForm.end_date
                          ? parseLocalDate(editSprintForm.end_date)?.toLocaleDateString()
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                    >
                      <CalendarIcon
                        mode="single"
                        month={parseLocalDate(editSprintForm.start_date) || new Date()}
                        selected={parseLocalDate(editSprintForm.end_date)}
                        onSelect={(date) => {
                          if (date) {
                            const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            setEditSprintForm((f) => ({ ...f, end_date: localDate }));
                            setShowCalendarEditSprintEnd(false);
                          }
                        }}
                        disabled={(date) =>
                          editSprintForm.start_date
                            ? date < parseLocalDate(editSprintForm.start_date)!
                            : false
                        }
                        classNames={{
                          months: 'flex flex-col',
                          month: 'space-y-4',
                          caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                          caption_label: 'text-sm font-medium text-white',
                          nav: 'space-x-1 flex items-center',
                          nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                          nav_button_previous: 'absolute left-0',
                          nav_button_next: 'absolute right-0',
                          table: 'w-full border-collapse space-y-1',
                          head_row: 'flex',
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => setEditingSprint(null)}
                className="text-[#737373] rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditSprint}
                disabled={
                  !editSprintForm.name.trim() ||
                  !editSprintForm.start_date ||
                  !editSprintForm.end_date
                }
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Sprint Confirmation */}
      {completingSprintId !== null &&
        (() => {
          const sprint = sprints.find((s) => s.id === completingSprintId);
          const sprintItems = workItems.filter((w) => w.sprint_id === completingSprintId);
          const doneCount = sprintItems.filter((w) => w.status === 'done').length;
          const incompleteCount = sprintItems.length - doneCount;
          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setCompletingSprintId(null)}
            >
              <div
                className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(224,185,84,0.1)] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-[#E0B954]" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Complete Sprint</h3>
                    <p className="text-xs text-[#737373] mt-0.5">{sprint?.name}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.15)] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#E0B954]">{doneCount}</p>
                    <p className="text-xs text-[#737373] mt-0.5">Completed</p>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#f5f5f5]">{incompleteCount}</p>
                    <p className="text-xs text-[#737373] mt-0.5">Incomplete</p>
                  </div>
                </div>
                {incompleteCount > 0 && (
                  <p className="text-sm text-[#a3a3a3] mb-5">
                    <span className="text-white font-medium">
                      {incompleteCount} incomplete {incompleteCount === 1 ? 'item' : 'items'}
                    </span>{' '}
                    will be moved to the backlog.
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setCompletingSprintId(null)}
                    className="text-[#737373] rounded-xl px-5"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCompleteSprint}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-5 font-medium shadow-lg shadow-[#B8872A]/20"
                  >
                    Complete Sprint
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Delete Sprint Confirmation */}
      {deletingSprintId !== null &&
        (() => {
          const sprint = sprints.find((s) => s.id === deletingSprintId);
          const itemCount = workItems.filter((w) => w.sprint_id === deletingSprintId).length;
          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setDeletingSprintId(null)}
            >
              <div
                className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5 text-[#EF4444]" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Delete Sprint</h3>
                    <p className="text-xs text-[#737373] mt-0.5">{sprint?.name}</p>
                  </div>
                </div>
                {itemCount > 0 && (
                  <div className="bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.15)] rounded-xl p-3 mb-5">
                    <p className="text-sm text-[#f5f5f5]">
                      <span className="font-semibold text-[#EF4444]">
                        {itemCount} {itemCount === 1 ? 'ticket' : 'tickets'}
                      </span>{' '}
                      will be moved to the backlog.
                    </p>
                  </div>
                )}
                <p className="text-sm text-[#737373] mb-5">
                  This permanently deletes the sprint and cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setDeletingSprintId(null)}
                    className="text-[#737373] rounded-xl px-5"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteSprint}
                    className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl px-5 font-medium"
                  >
                    Delete Sprint
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Reviewer Panel - slide in from right */}
      {showReviewer && (
        <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-[#080808] border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#E0B954]/10 flex items-center justify-center">
                <Eye className="w-4 h-4 text-[#E0B954]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Review Queue</h2>
                <p className="text-xs text-[#737373]">Items pending review</p>
              </div>
            </div>
            <button
              onClick={() => setShowReviewer(false)}
              className="p-1.5 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ReviewerView
              workItems={workItems.map((item) => ({
                ...item,
                assignee_id: item.assignee_id ?? undefined,
                sprint_id: item.sprint_id ?? undefined,
                parent_id: item.parent_id ?? undefined,
                epic_id: item.epic_id ?? undefined,
                due_date: item.due_date ?? undefined,
                estimated_hours: item.estimated_hours ?? undefined,
              }))}
              projectId={id!}
              token={token!}
              onTaskUpdate={(itemId, updates) => {
                queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters], (old) =>
                  (old ?? []).map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
                );
                invalidateWorkItems();
              }}
            />
          </div>
        </div>
      )}

      {/* Architecture Editor Modal */}
      {editingArchitecture && (
        <ArchitectureEditor
          architecture={editingArchitecture}
          onSave={handleSaveArchitecture}
          onClose={() => setEditingArchitecture(null)}
        />
      )}
    </div>
  );
};

export default ProjectBoard;
