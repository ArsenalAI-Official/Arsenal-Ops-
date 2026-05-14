import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ArrowRight,
  Inbox,
  Calendar,
  Eye,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast, Toaster } from 'sonner';
import { ReviewerView } from '@/components/ProjectHub';
import AIPlanningModal from './modals/AIPlanningModal';
import CreateItemModal from './modals/CreateItemModal';
import CreateSprintModal from './modals/CreateSprintModal';
import BoardColumn from './components/BoardColumn';
import { useAuth } from '@/contexts/AuthContext';
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
  backlog: { label: 'Backlog', color: '#737373', icon: Inbox, gradient: 'from-[#737373]/10' },
  todo: { label: 'To Do', color: '#E0B954', icon: Plus, gradient: 'from-[#E0B954]/10' },
  in_progress: {
    label: 'In Progress',
    color: '#F59E0B',
    icon: Clock,
    gradient: 'from-[#F59E0B]/10',
  },
  in_review: {
    label: 'In Review',
    color: '#C79E3B',
    icon: AlertCircle,
    gradient: 'from-[#C79E3B]/10',
  },
  done: { label: 'Done', color: '#E0B954', icon: CheckCircle2, gradient: 'from-[#E0B954]/10' },
} as const;

const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#C79E3B', label: 'Epic', bg: 'rgba(199,158,59,0.15)' },
};

const PRIORITY_COLORS = {
  critical: { border: 'border-red-500/60', text: 'text-red-400', bg: 'bg-red-500/10' },
  high: { border: 'border-orange-500/60', text: 'text-orange-400', bg: 'bg-orange-500/10' },
  medium: { border: 'border-yellow-500/50', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  low: { border: 'border-emerald-500/50', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const ProjectBoard = () => {
  const { id, ticketId } = useParams<{ id: string; ticketId?: string }>();
  const navigate = useNavigate();
  const { token } = useAuth(); // kept for legacy child components (KanbanCard→TimeEntriesTable, TicketContributors, ReviewerView)
  const queryClient = useQueryClient();
  const [showReviewer, setShowReviewer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [assigneeSearchFilter, setAssigneeSearchFilter] = useState('');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // AI Planning flow — only the open/close toggle lives here
  const [showAIModal, setShowAIModal] = useState(false);

  // Sprint and timeline states
  const [selectedSprintId, setSelectedSprintId] = useState<number | 'all' | 'backlog'>('all');
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [newSprint, setNewSprint] = useState({ name: '', goal: '', start_date: '', end_date: '' });

  // Calendar popover states
  const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);
  const [showCalendarSprintStart, setShowCalendarSprintStart] = useState(false);
  const [showCalendarSprintEnd, setShowCalendarSprintEnd] = useState(false);

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

  // Filters object drives the query key so filter changes auto-refetch
  const workItemFilters = { project_id: id };
  const workItemsQuery = useQuery<WorkItem[]>({
    queryKey: ['workItems', workItemFilters],
    queryFn: () => apiFetch<WorkItem[]>(`/api/workitems/?project_id=${id}`),
    enabled: !!id,
  });
  const workItems = workItemsQuery.data ?? [];

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

  // Derived: unique tags computed from cached workItems — no useEffect needed
  const existingTags = Array.from(
    new Set(
      workItems
        .filter((item) => item.type === 'task')
        .flatMap((item) => (item.tags ?? []).map((t: string) => String(t).trim().toLowerCase()))
        .filter(Boolean),
    ),
  ).sort();

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
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
    if (filterAssignee !== 'all') {
      if (filterAssignee === 'unassigned') {
        if (item.assignee_id !== null && item.assignee_id !== undefined) return false;
      } else {
        if (String(item.assignee_id) !== filterAssignee) return false;
      }
    }
    // Tags filter - if any tags are selected, item must have at least one of them
    if (filterTags.length > 0) {
      const hasMatchingTag = filterTags.some((tag) => item.tags?.includes(tag));
      if (!hasMatchingTag) return false;
    }
    // Sprint filter
    if (selectedSprintId === 'backlog' && item.sprint_id !== null) return false;
    if (typeof selectedSprintId === 'number' && item.sprint_id !== selectedSprintId) return false;
    return true;
  });

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
      await queryClient.cancelQueries({ queryKey: ['workItems', workItemFilters] });
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
  const handleCreateSprint = async () => {
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
        // Check if new sprint overlaps with existing sprint
        return startDate <= existingEnd && endDate >= existingStart;
      });
      if (hasOverlap) {
        toast.error('Sprint dates overlap with an existing sprint. Sprints cannot overlap.');
        return;
      }
    }
    try {
      await apiFetch('/api/workitems/sprints/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(id!),
          name: newSprint.name,
          goal: newSprint.goal,
          start_date: newSprint.start_date || null,
          end_date: newSprint.end_date || null,
        }),
      });
      toast.success('Sprint created!');
      setShowCreateSprintModal(false);
      setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
      queryClient.invalidateQueries({ queryKey: ['sprints', id] });
    } catch {
      toast.error('Failed to create sprint');
    }
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

  // Submit comment mutation
  const submitCommentMutation = useMutation({
    mutationFn: (commentType: 'comment' | 'blocker' | 'business_review') =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(selectedItem!.id),
          content: newComment,
          author_id: project?.developers?.[0]?.id || 1,
          comment_type: commentType,
        }),
      }),
    onSuccess: (_data, commentType) => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['workItem', selectedItem?.id, 'comments'] });
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
    submitCommentMutation.mutate(commentType);
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

  // Quick status change — optimistic via the same cache key as drag-drop
  const statusChangeMutation = useMutation({
    mutationFn: ({ itemId, newStatus }: { itemId: string; newStatus: string }) =>
      apiFetch(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onMutate: async ({ itemId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['workItems', workItemFilters] });
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
          Back to Projects
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
              Projects
            </Button>
            <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-xs font-bold text-white">
                {project.key_prefix.substring(0, 2)}
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">{project.name}</h1>
                <p className="text-xs text-[#737373] font-mono">{project.key_prefix}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/project/${id}`)}
              className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg"
              title="Back to Project Overview"
            >
              <X className="w-4 h-4" />
            </Button>
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
              onClick={() => setShowAIModal(true)}
              disabled={showAIModal}
              size="sm"
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-9"
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              AI Generate
            </Button>
            <Button
              onClick={() => setShowCreateForm(true)}
              size="sm"
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-9"
            >
              <Plus className="w-3.5 h-3.5 mr-2" />
              New Item
            </Button>
          </div>
        </div>

        {/* Stats + Filters Bar */}
        <div className="px-6 py-2.5 flex items-center justify-between border-t border-[rgba(255,255,255,0.03)]">
          <div className="flex items-center gap-6">
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
          </div>
          {/* Advanced Filter Bar */}
          <div className="flex flex-col gap-3">
            {/* Search & Active Filters & Add Filter & View Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
                />
              </div>

              {/* Active Filter Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {filterType !== 'all' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E0B954]/15 border border-[#E0B954]/30 rounded-full text-xs text-[#E0B954] font-medium">
                    {TYPE_CONFIG[filterType as keyof typeof TYPE_CONFIG]?.label || filterType}
                    <button
                      onClick={() => setFilterType('all')}
                      className="hover:bg-[#E0B954]/20 rounded-full p-0.5 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {filterPriority !== 'all' && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[filterPriority as keyof typeof PRIORITY_COLORS]?.bg} ${PRIORITY_COLORS[filterPriority as keyof typeof PRIORITY_COLORS]?.text}`}
                  >
                    {filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1)}
                    <button
                      onClick={() => setFilterPriority('all')}
                      className="hover:opacity-75 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {filterAssignee !== 'all' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#60A5FA]/15 border border-[#60A5FA]/30 rounded-full text-xs text-[#60A5FA] font-medium">
                    {filterAssignee === 'unassigned'
                      ? 'Unassigned'
                      : project?.developers?.find((d) => String(d.id) === filterAssignee)?.name ||
                        filterAssignee}
                    <button
                      onClick={() => setFilterAssignee('all')}
                      className="hover:bg-[#60A5FA]/20 rounded-full p-0.5 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {filterTags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E0B954]/15 border border-[#E0B954]/30 rounded-full text-xs text-[#E0B954] font-medium"
                  >
                    {tag}
                    <button
                      onClick={() => setFilterTags(filterTags.filter((t) => t !== tag))}
                      className="hover:bg-[#E0B954]/20 rounded-full p-0.5 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Clear All Filters */}
              {(filterType !== 'all' ||
                filterPriority !== 'all' ||
                filterAssignee !== 'all' ||
                filterTags.length > 0) && (
                <button
                  onClick={() => {
                    setFilterType('all');
                    setFilterPriority('all');
                    setFilterAssignee('all');
                    setFilterTags([]);
                  }}
                  className="text-xs text-[#737373] hover:text-red-400 underline hover:no-underline transition-colors"
                >
                  Clear all
                </button>
              )}

              {/* Add Filter Button */}
              <div className="relative" ref={filterMenuRef}>
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className="flex items-center gap-1.5 px-2.5 py-1 h-8 text-xs bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add filter
                </button>

                {/* Filter Menu Popover */}
                {showFilterMenu && (
                  <div className="absolute top-full mt-2 left-0 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 min-w-max">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(255,255,255,0.05)]">
                      <p className="text-xs font-semibold text-[#737373]">Add Filters</p>
                      <button
                        onClick={() => setShowFilterMenu(false)}
                        className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] text-[#737373] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-2">
                      {/* Type Filter */}
                      {filterType === 'all' && (
                        <div className="px-3 py-2">
                          <p className="text-xs font-semibold text-[#737373] mb-2">Type</p>
                          <div className="space-y-1">
                            {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                              <button
                                key={key}
                                onClick={() => {
                                  setFilterType(key);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                              >
                                <config.icon
                                  className="w-3.5 h-3.5"
                                  style={{ color: config.color }}
                                />
                                {config.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Priority Filter */}
                      {filterPriority === 'all' && (
                        <>
                          {filterType !== 'all' && (
                            <div className="h-px bg-[rgba(255,255,255,0.05)] my-1" />
                          )}
                          <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-[#737373] mb-2">Priority</p>
                            <div className="space-y-1">
                              {Object.entries(PRIORITY_COLORS).map(([key, colors]) => (
                                <button
                                  key={key}
                                  onClick={() => {
                                    setFilterPriority(key);
                                  }}
                                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors ${colors.text}`}
                                >
                                  <div className={`w-2.5 h-2.5 rounded-full ${colors.bg}`} />
                                  {key.charAt(0).toUpperCase() + key.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Assignee Filter */}
                      {filterAssignee === 'all' &&
                        project?.developers &&
                        project.developers.length > 0 && (
                          <>
                            {(filterType !== 'all' || filterPriority !== 'all') && (
                              <div className="h-px bg-[rgba(255,255,255,0.05)] my-1" />
                            )}
                            <div className="px-3 py-2">
                              <p className="text-xs font-semibold text-[#737373] mb-2">Assignee</p>
                              {/* Search Input for Assignees */}
                              <div className="relative mb-2">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
                                <input
                                  type="text"
                                  placeholder="Search assignees..."
                                  value={assigneeSearchFilter}
                                  onChange={(e) => setAssigneeSearchFilter(e.target.value)}
                                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
                                />
                              </div>
                              <div className="space-y-1 max-h-56 overflow-y-auto">
                                <button
                                  onClick={() => {
                                    setFilterAssignee('unassigned');
                                    setAssigneeSearchFilter('');
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                                >
                                  <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center text-[10px]" />
                                  Unassigned
                                </button>
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
                                  .map((dev) => (
                                    <button
                                      key={dev.id}
                                      onClick={() => {
                                        setFilterAssignee(String(dev.id));
                                        setAssigneeSearchFilter('');
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                                    >
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-[10px] font-semibold">
                                        {dev.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 text-left">
                                        <div className="text-xs font-medium">{dev.name}</div>
                                        <div className="text-[10px] text-[#737373]">
                                          {dev.email}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                {project.developers.filter(
                                  (dev) =>
                                    dev.name
                                      .toLowerCase()
                                      .includes(assigneeSearchFilter.toLowerCase()) ||
                                    dev.email
                                      .toLowerCase()
                                      .includes(assigneeSearchFilter.toLowerCase()),
                                ).length === 0 &&
                                  assigneeSearchFilter && (
                                    <div className="px-2.5 py-2 text-xs text-[#737373] text-center">
                                      No assignees found
                                    </div>
                                  )}
                              </div>
                            </div>
                          </>
                        )}

                      {/* Tags Filter */}
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-[#737373] mb-2">Tags</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {existingTags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                setFilterTags((prev) =>
                                  prev.includes(tag)
                                    ? prev.filter((t) => t !== tag)
                                    : [...prev, tag],
                                );
                              }}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                                filterTags.includes(tag)
                                  ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                                  : 'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                                  filterTags.includes(tag)
                                    ? 'bg-[#E0B954] border-[#E0B954] text-black'
                                    : 'border-[rgba(255,255,255,0.2)]'
                                }`}
                              >
                                {filterTags.includes(tag) && '✓'}
                              </div>
                              {tag}
                            </button>
                          ))}
                          {existingTags.length === 0 && (
                            <div className="px-2.5 py-2 text-xs text-[#737373] text-center">
                              No tags available
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* View Toggle */}
              <div className="flex bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('board')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'board' ? 'bg-[#E0B954] text-white' : 'text-[#737373] hover:text-white'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[#E0B954] text-white' : 'text-[#737373] hover:text-white'}`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sprint Selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedSprintId}
                  onChange={(e) =>
                    setSelectedSprintId(
                      e.target.value === 'all'
                        ? 'all'
                        : e.target.value === 'backlog'
                          ? 'backlog'
                          : parseInt(e.target.value),
                    )
                  }
                  className={`h-8 text-xs rounded-lg px-2.5 appearance-none cursor-pointer font-medium transition-colors ${selectedSprintId === 'all' ? 'bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white shadow-lg shadow-[#B8872A]/20' : 'bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#a3a3a3] hover:border-[rgba(244,246,255,0.12)]'}`}
                >
                  <option value="all">All Items</option>
                  <option value="backlog">📋 Backlog</option>
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      🏃 {sprint.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => setShowCreateSprintModal(true)}
                  size="sm"
                  className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-8 px-3 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  New Sprint
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto">
        {viewMode === 'board' ? (
          /* KANBAN BOARD VIEW */
          <div className="flex gap-4 p-6 min-h-[calc(100vh-140px)]">
            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
              <BoardColumn
                key={status}
                status={status}
                columnItems={filteredItems.filter((item) => item.status === status)}
                dragOverColumn={dragOverColumn}
                draggedItem={draggedItem}
                token={token || ''}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onCardDragStart={handleDragStart}
                onCardMouseEnter={prefetchComments}
                onCardClick={(itemId) => {
                  navigate(`/project/${id}/board/${itemId}`);
                  setIsEditing(false);
                  setEditForm({});
                }}
              />
            ))}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="p-6">
            <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3 border-b border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                <span>Title</span>
                <span>Type</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Points</span>
                <span>Assignee</span>
              </div>
              {/* Table Rows */}
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center text-[#737373] text-sm">No items found</div>
              ) : (
                filteredItems.map((item) => {
                  const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                  const TypeIcon = typeInfo.icon;
                  const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.todo;
                  const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => prefetchComments(item.id)}
                      onClick={() => {
                        navigate(`/project/${id}/board/${item.id}`);
                        setIsEditing(false);
                        setEditForm({});
                      }}
                      className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
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
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: statusConf.color }}
                          />
                          <span className="text-xs text-[#a3a3a3]">{statusConf.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${priorityStyle.border} ${priorityStyle.text}`}
                        >
                          {item.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm font-semibold text-[#E0B954]">
                          {item.story_points}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-xs text-[#737373] truncate">{item.assignee}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, type: e.target.value as WorkItem['type'] }))
                        }
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
                        color: (
                          PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium
                        ).text
                          .replace('text-', '')
                          .includes('red')
                          ? '#EF4444'
                          : (
                                PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium
                              ).text.includes('orange')
                            ? '#F97316'
                            : (
                                  PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium
                                ).text.includes('yellow')
                              ? '#F59E0B'
                              : '#E0B954',
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

                  {/* Hierarchy breadcrumb */}
                  {(selectedItem.epic_key || selectedItem.parent_key) &&
                    (() => {
                      const parentItem = selectedItem.parent_id
                        ? workItems.find((wi) => wi.id === selectedItem.parent_id?.toString())
                        : null;
                      const epicItem = selectedItem.epic_id
                        ? workItems.find((wi) => wi.id === selectedItem.epic_id?.toString())
                        : null;
                      return (
                        <div>
                          <div className="text-xs text-[#737373] mb-2 font-medium">Hierarchy</div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {selectedItem.epic_key && epicItem && (
                              <a
                                href={`/project/${id}/board/${epicItem.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(167,139,250,0.12)] text-[#A78BFA] text-xs hover:bg-[rgba(167,139,250,0.2)] transition-colors cursor-pointer"
                              >
                                Epic: {selectedItem.epic_key} ({epicItem.title})
                              </a>
                            )}
                            {selectedItem.epic_key && selectedItem.parent_key && (
                              <span className="text-[#555] text-xs">›</span>
                            )}
                            {selectedItem.parent_key && parentItem && (
                              <a
                                href={`/project/${id}/board/${parentItem.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(224,185,84,0.10)] text-[#E0B954] text-xs hover:bg-[rgba(224,185,84,0.2)] transition-colors cursor-pointer"
                              >
                                Parent: {selectedItem.parent_key} ({parentItem.title})
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Child items */}
                  {(() => {
                    const children = workItems.filter(
                      (wi) => wi.parent_id === parseInt(selectedItem.id),
                    );
                    return children.length > 0 ? (
                      <div>
                        <div className="text-xs text-[#737373] mb-2 font-medium">
                          Child Items ({children.length})
                        </div>
                        <div className="space-y-1.5">
                          {children.map((child) => (
                            <div
                              key={child.id}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] cursor-pointer hover:border-[rgba(255,255,255,0.08)] transition-colors"
                              onClick={() => navigate(`/project/${id}/board/${child.id}`)}
                            >
                              <span className="text-xs font-mono text-[#737373] flex-shrink-0">
                                {child.key}
                              </span>
                              <span className="text-sm text-[#a3a3a3] truncate flex-1">
                                {child.title}
                              </span>
                              <span className="text-xs text-[#555] capitalize flex-shrink-0">
                                {child.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
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

                  {/* Child Items (if this is an Epic) */}
                  {selectedItem.type === 'epic' &&
                    (() => {
                      const childItems = workItems.filter(
                        (wi) => wi.epic_id === parseInt(selectedItem.id),
                      );
                      return childItems.length > 0 ? (
                        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                          <div className="text-xs text-[#737373] mb-3 font-medium">
                            Child Items ({childItems.length})
                          </div>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {childItems.map((child) => {
                              const childTypeInfo = TYPE_CONFIG[child.type] || TYPE_CONFIG.task;
                              const childPriorityStyle =
                                PRIORITY_COLORS[child.priority] || PRIORITY_COLORS.medium;
                              return (
                                <a
                                  key={child.id}
                                  href={`/project/${id}/board/${child.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(244,246,255,0.15)] cursor-pointer transition-all"
                                >
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-2 flex-1">
                                      <div
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
                                        style={{
                                          backgroundColor: childTypeInfo.bg,
                                          color: childTypeInfo.color,
                                        }}
                                      >
                                        <childTypeInfo.icon className="w-2.5 h-2.5" />
                                        {childTypeInfo.label}
                                      </div>
                                      <span className="text-[9px] text-[#E0B954] font-mono">
                                        {child.key}
                                      </span>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] px-1 py-0 h-5 flex-shrink-0 ${childPriorityStyle.border} ${childPriorityStyle.text}`}
                                    >
                                      {child.priority}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-[#a3a3a3] line-clamp-1 mb-1.5">
                                    {child.title}
                                  </p>
                                  <div className="flex items-center justify-between text-[9px] text-[#737373]">
                                    <span>{child.remaining_hours}h left</span>
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px]"
                                      style={{
                                        backgroundColor: `${(STATUS_CONFIG[child.status] || STATUS_CONFIG.todo).color}22`,
                                        color: (STATUS_CONFIG[child.status] || STATUS_CONFIG.todo)
                                          .color,
                                      }}
                                    >
                                      {(STATUS_CONFIG[child.status] || STATUS_CONFIG.todo).label}
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null;
                    })()}

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
      <CreateItemModal
        showCreateForm={showCreateForm}
        handleCloseCreateForm={handleCloseCreateForm}
        createForm={createForm}
        setCreateForm={setCreateForm}
        tagInput={tagInput}
        setTagInput={setTagInput}
        existingTags={existingTags}
        workItems={workItems}
        project={project}
        isCreatingItem={isCreatingItem}
        handleCreateItem={handleCreateItem}
      />


      {/* AI Planning Modal */}
      <AIPlanningModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        projectId={project.id}
        onTicketsCreated={() => {
          invalidateWorkItems();
          queryClient.invalidateQueries({ queryKey: ['sprints', id] });
          invalidateProject();
        }}
      />

      {/* Create Sprint Modal */}
      <CreateSprintModal
        showCreateSprintModal={showCreateSprintModal}
        setShowCreateSprintModal={setShowCreateSprintModal}
        newSprint={newSprint}
        setNewSprint={setNewSprint}
        showCalendarSprintStart={showCalendarSprintStart}
        setShowCalendarSprintStart={setShowCalendarSprintStart}
        showCalendarSprintEnd={showCalendarSprintEnd}
        setShowCalendarSprintEnd={setShowCalendarSprintEnd}
        handleCreateSprint={handleCreateSprint}
      />

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

    </div>
  );
};

export default ProjectBoard;
