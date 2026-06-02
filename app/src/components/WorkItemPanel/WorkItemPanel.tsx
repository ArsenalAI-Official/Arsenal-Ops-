import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Calendar,
  Plus,
  MessageSquare,
  AlertCircle,
  Clock,
  ArrowRight,
  Inbox,
  ExternalLink,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';
import TicketContributors from '@/components/TicketContributors';
import { WorkItemCombobox } from '@/components/WorkItemCombobox';
import {
  validateReparent,
  getAllowedTargetTypes,
  fieldSupportsType,
} from '@/lib/hierarchy/validateReparent';
import { apiFetch } from '@/lib/api';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import {
  TYPE_CONFIG,
  STATUS_CONFIG,
  PRIORITY_COLOR,
  CALENDAR_CLASS_NAMES,
} from './constants';
import type { WorkItem, Sprint, AllDeveloper, ProjectLite, Comment, ProjectDeveloper } from './types';

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
  sprints: Sprint[];
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderTextWithNewlines(text: string) {
  if (!text) return null;
  return text
    .split('\n')
    .flatMap((line, i, arr) => [
      <span key={`l-${i}`}>{line}</span>,
      i < arr.length - 1 ? <br key={`b-${i}`} /> : null,
    ])
    .filter(Boolean);
}

function renderCommentContent(
  content: string,
  mentions: number[] = [],
  devMap: Map<number, string>,
) {
  let result = content;
  mentions.forEach((devId) => {
    const devName = devMap.get(devId);
    if (devName) {
      const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      result = result.replace(regex, `<<<M_${devId}>>>`);
    }
  });
  const urls: string[] = [];
  result = result.replace(/(https?:\/\/[^\s]+)/g, (m) => {
    urls.push(m);
    return `<<<U_${urls.length - 1}>>>`;
  });
  const parts = result.split(/(<<<M_\d+>>>|<<<U_\d+>>>)/g);
  let idx = 0;
  return parts.flatMap((part) => {
    const mm = part.match(/<<<M_(\d+)>>>/);
    if (mm) {
      return (
        <span key={`m-${idx++}`} className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium">
          @{devMap.get(parseInt(mm[1]))}
        </span>
      );
    }
    const um = part.match(/<<<U_(\d+)>>>/);
    if (um) {
      const url = urls[parseInt(um[1])];
      return (
        <a key={`u-${idx++}`} href={url} target="_blank" rel="noopener noreferrer"
          className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all">
          {url}
        </a>
      );
    }
    return part.split('\n').flatMap((line, li, arr) => [
      <span key={`t-${idx}-${li}`}>{line}</span>,
      li < arr.length - 1 ? <br key={`tb-${idx}-${li}`} /> : null,
    ]).filter(Boolean);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const WorkItemPanel = (props: WorkItemPanelProps) => {
  const { item, token, currentUserId, onClose } = props;
  const queryClient = useQueryClient();

  // ─── Edit form state ───────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
  const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);
  // Compact variant: project developers fetched on edit start
  const [compactEditDevs, setCompactEditDevs] = useState<ProjectDeveloper[]>([]);

  // Full variant subtask form
  interface SubtaskForm { title: string; assignee_id: number | null; estimated_hours: string; due_date: string }
  const emptySubtask: SubtaskForm = { title: '', assignee_id: null, estimated_hours: '', due_date: '' };
  const [newSubtask, setNewSubtask] = useState<SubtaskForm>(emptySubtask);
  const [showSubtaskDatePicker, setShowSubtaskDatePicker] = useState(false);

  // ─── Comment state ─────────────────────────────────────────────────────────
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  // ─── Log hours ref (replaces getElementById anti-pattern) ─────────────────
  const logHoursRef = useRef<HTMLInputElement>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────
  const itemDetailQuery = useQuery<WorkItem>({
    queryKey: ['workItem', item.id, 'detail'],
    queryFn: () => apiFetch(`/api/workitems/${item.id}`),
    enabled: !!item.id,
  });
  const itemDetail: WorkItem = useMemo(
    () => ({ ...item, ...(itemDetailQuery.data ?? {}) }),
    [item, itemDetailQuery.data],
  );

  const commentsQuery = useQuery<Comment[]>({
    queryKey: ['workItem', item.id, 'comments'],
    queryFn: () => apiFetch(`/api/comments/workitem/${item.id}`),
    enabled: !!item.id,
  });
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);

  const developersQuery = useQuery<AllDeveloper[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch('/api/developers/'),
  });
  const allDevelopers = useMemo(() => developersQuery.data ?? [], [developersQuery.data]);
  const devMap = useMemo(() => new Map(allDevelopers.map((d) => [d.id, d.name])), [allDevelopers]);

  // ─── isAssignee ────────────────────────────────────────────────────────────
  const isAssignee = useMemo(
    () => !!currentUserId && !!item.assignee_id && currentUserId === item.assignee_id,
    [currentUserId, item.assignee_id],
  );

  // ─── Full-variant hierarchy helpers ────────────────────────────────────────
  // Hoist the conditional before useMemo so the dep array is stable.
  const workItemsProp = 'workItems' in props ? props.workItems : undefined;
  const fullWorkItems = useMemo(() => workItemsProp ?? [], [workItemsProp]);

  const depth1ParentExclusions = useMemo(() => {
    const ex = new Set<number>();
    for (const wi of fullWorkItems) {
      if (wi.parent_id != null) {
        const n = Number(wi.id);
        if (!Number.isNaN(n)) ex.add(n);
      }
    }
    return ex;
  }, [fullWorkItems]);

  const parentExcludeIds = useMemo(() => {
    const ex = new Set<number>(depth1ParentExclusions);
    const subjectId = Number(item.id);
    if (Number.isNaN(subjectId)) return ex;
    ex.add(subjectId);
    const childrenByParent = new Map<number, string[]>();
    for (const wi of fullWorkItems) {
      if (wi.parent_id != null) {
        const arr = childrenByParent.get(wi.parent_id) ?? [];
        arr.push(wi.id);
        childrenByParent.set(wi.parent_id, arr);
      }
    }
    const queue = [subjectId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const cid of childrenByParent.get(cur) ?? []) {
        const cn = Number(cid);
        if (!Number.isNaN(cn) && !ex.has(cn)) { ex.add(cn); queue.push(cn); }
      }
    }
    return ex;
  }, [depth1ParentExclusions, item, fullWorkItems]);

  const epicExcludeIds = useMemo(() => {
    const ex = new Set<number>();
    const n = Number(item.id);
    if (!Number.isNaN(n)) ex.add(n);
    return ex;
  }, [item]);

  const selectedItemHasChildren = useMemo(() => {
    const n = Number(item.id);
    if (Number.isNaN(n)) return false;
    return fullWorkItems.some((wi) => wi.parent_id === n);
  }, [item, fullWorkItems]);

  const subtasksOfCurrent = useMemo(() => {
    const subjectId = Number(item.id);
    if (Number.isNaN(subjectId)) return [];
    return fullWorkItems.filter((wi) => wi.type === 'subtask' && wi.parent_id === subjectId);
  }, [fullWorkItems, item.id]);

  const parentOfCurrent = useMemo(() => {
    if (item.type !== 'subtask' || item.parent_id == null) return null;
    return fullWorkItems.find((wi) => Number(wi.id) === item.parent_id) ?? null;
  }, [fullWorkItems, item.type, item.parent_id]);

  const canHaveSubtasks = item.type === 'task' || item.type === 'user_story' || item.type === 'bug';

  // ─── Compact mutations ─────────────────────────────────────────────────────
  const invalidateWorkItems = () => {
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  };

  const saveEditCompact = useMutation({
    mutationFn: (edits: Partial<WorkItem>) =>
      apiFetch(`/api/workitems/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(edits),
      }),
    onSuccess: (updated: WorkItem) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...editForm, ...updated });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      setIsEditing(false);
      setEditForm({});
      toast.success('Task updated');
    },
    onError: () => toast.error('Failed to update task'),
  });

  const statusChangeCompact = useMutation({
    mutationFn: (newStatus: string) =>
      apiFetch(`/api/workitems/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: (updated: WorkItem) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...updated });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const logHoursCompact = useMutation({
    mutationFn: (hours: number) =>
      apiFetch(`/api/workitems/${item.id}/log-hours`, {
        method: 'POST',
        body: JSON.stringify({ hours }),
      }),
    onSuccess: (data: { logged_hours: number; remaining_hours: number }) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...data });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      toast.success(`Logged hours!`);
      if (logHoursRef.current) logHoursRef.current.value = '';
    },
    onError: () => toast.error('Failed to log hours'),
  });

  // ─── Full-variant subtask mutation ─────────────────────────────────────────
  const createSubtask = useMutation({
    mutationFn: (form: SubtaskForm) => {
      const projectId =
        (item as WorkItem & { project_id?: number }).project_id ??
        (props.variant === 'full' ? Number(props.projectId) : undefined);
      if (!projectId) throw new Error('Missing project id');
      const estimated = (() => {
        const n = Number(form.estimated_hours.trim() || 0);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
      })();
      return apiFetch('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          type: 'subtask',
          title: form.title,
          parent_id: Number(item.id),
          assignee_id: form.assignee_id,
          estimated_hours: estimated,
          remaining_hours: estimated,
          due_date: form.due_date || null,
        }),
      });
    },
    onSuccess: () => {
      setNewSubtask(emptySubtask);
      toast.success('Subtask added');
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create subtask');
    },
  });

  // ─── Comment mutation (both variants) ─────────────────────────────────────
  const submitComment = useMutation({
    mutationFn: ({ content, type }: { content: string; type: Comment['comment_type'] }) =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(item.id),
          content,
          comment_type: type,
          author_id: currentUserId ?? 1,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      setNewComment('');
    },
    onError: () => toast.error('Failed to add comment'),
  });

  // ─── Action wrappers (route to full callbacks or compact mutations) ─────────
  const isSavingEdit = props.variant === 'full' ? props.isSavingEdit : saveEditCompact.isPending;
  const isLoggingHours = props.variant === 'full' ? props.isLoggingHours : logHoursCompact.isPending;

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

  // ─── Edit form start ───────────────────────────────────────────────────────
  const startEditing = async () => {
    if (props.variant === 'compact') {
      // Fetch project developers for the assignee dropdown
      try {
        const projectId = (item as WorkItem & { project_id?: number }).project_id;
        if (projectId) {
          const data = await apiFetch(`/api/projects/${projectId}`);
          setCompactEditDevs((data as { developers?: ProjectDeveloper[] }).developers ?? []);
        }
      } catch { /* proceed without project devs */ }
    }
    setEditForm({ ...itemDetail });
    setIsEditing(true);
  };

  // ─── Comment helpers ───────────────────────────────────────────────────────
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1) {
      const after = value.substring(lastAt + 1);
      if (!after.includes(' ')) { setMentionFilter(after); setShowMentions(true); }
      else setShowMentions(false);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (dev: { id: number; name: string }) => {
    const lastAt = newComment.lastIndexOf('@');
    setNewComment(`${newComment.substring(0, lastAt)}@${dev.name} `);
    setShowMentions(false);
    setMentionFilter('');
  };

  const handleSubmitComment = (type: Comment['comment_type'] = 'comment') => {
    if (!newComment.trim()) return;
    submitComment.mutate({ content: newComment, type });
  };

  // ─── Derived display values ────────────────────────────────────────────────
  const typeConfig = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.task;
  const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.todo;
  const priorityColor = PRIORITY_COLOR[item.priority] ?? '#737373';

  // ─── Edit form (full variant) ──────────────────────────────────────────────
  const renderFullEditForm = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
        <Input
          defaultValue={item.title}
          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
        <Textarea
          defaultValue={itemDetail.description}
          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
        />
      </div>
      <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
          <select
            defaultValue={item.type}
            onChange={(e) => {
              const newType = e.target.value as WorkItem['type'];
              setEditForm((f) => {
                const next: Partial<WorkItem> = { ...f, type: newType };
                if (!fieldSupportsType(newType, 'epic_id')) { next.epic_id = null; next.epic_key = null; }
                if (!fieldSupportsType(newType, 'parent_id')) { next.parent_id = null; next.parent_key = null; }
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
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
          <select
            defaultValue={item.priority}
            onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as WorkItem['priority'] }))}
            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
          <Input type="number" defaultValue={item.story_points}
            onChange={(e) => setEditForm((f) => ({ ...f, story_points: parseInt(e.target.value) || 0 }))}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
        {item.type !== 'epic' && (
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
            <Input type="number" defaultValue={item.assigned_hours}
              onChange={(e) => setEditForm((f) => ({ ...f, assigned_hours: parseInt(e.target.value) || 0 }))}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
        )}
      </div>
      {item.type !== 'epic' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Logged Hours</label>
            <Input type="number" defaultValue={item.logged_hours || 0}
              onChange={(e) => setEditForm((f) => ({ ...f, logged_hours: parseInt(e.target.value) || 0 }))}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Remaining Hours</label>
            <Input type="number" defaultValue={item.remaining_hours}
              onChange={(e) => setEditForm((f) => ({ ...f, remaining_hours: parseInt(e.target.value) || 0 }))}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
        <select
          value={editForm.assignee_id ?? item.assignee_id ?? ''}
          onChange={(e) => setEditForm((f) => ({ ...f, assignee_id: e.target.value ? parseInt(e.target.value) : null }))}
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {(props.variant === 'full' ? props.project?.developers : [])?.map((dev) => (
            <option key={dev.id} value={dev.id}>{dev.name} ({dev.role})</option>
          ))}
        </select>
      </div>
      {fieldSupportsType((editForm.type ?? item.type) as WorkItem['type'], 'epic_id') && (
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Epic</label>
          <WorkItemCombobox
            value={editForm.epic_id ?? item.epic_id ?? null}
            valueKey={editForm.epic_key ?? item.epic_key ?? null}
            items={fullWorkItems}
            allowedTypes={getAllowedTargetTypes((editForm.type ?? item.type) as WorkItem['type'], 'epic_id')}
            excludeIds={epicExcludeIds}
            onChange={(newId, newKey) => {
              const target = newId != null ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null) : null;
              const v = validateReparent({ ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] }, target, 'epic_id', fullWorkItems);
              if (!v.ok) { toast.error(v.reason ?? 'Invalid epic'); return; }
              setEditForm((f) => ({ ...f, epic_id: newId, epic_key: newKey }));
            }}
            placeholder="No epic"
          />
        </div>
      )}
      {fieldSupportsType((editForm.type ?? item.type) as WorkItem['type'], 'parent_id') && (
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5" title="This task is part of a larger story or task.">Belongs to</label>
          <WorkItemCombobox
            value={editForm.parent_id ?? item.parent_id ?? null}
            valueKey={editForm.parent_key ?? item.parent_key ?? null}
            items={fullWorkItems}
            allowedTypes={getAllowedTargetTypes((editForm.type ?? item.type) as WorkItem['type'], 'parent_id')}
            excludeIds={parentExcludeIds}
            disabled={selectedItemHasChildren}
            onChange={(newId, newKey) => {
              const target = newId != null ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null) : null;
              const v = validateReparent({ ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] }, target, 'parent_id', fullWorkItems);
              if (!v.ok) { toast.error(v.reason ?? 'Invalid parent'); return; }
              setEditForm((f) => ({ ...f, parent_id: newId, parent_key: newKey }));
            }}
            placeholder="No parent"
          />
          {selectedItemHasChildren && (
            <p className="text-[10px] text-[#737373] mt-1.5 leading-snug">This task already has child tasks, so it can't be nested under another item.</p>
          )}
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint</label>
        <Input defaultValue={itemDetail.sprint}
          onChange={(e) => setEditForm((f) => ({ ...f, sprint: e.target.value }))}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
        <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
          <PopoverTrigger asChild>
            <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
              <Calendar className="w-4 h-4 mr-2" />
              {editForm.due_date
                ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]" align="start">
            <CalendarIcon
              mode="single"
              selected={parseLocalDate(editForm.due_date === '' || !editForm.due_date ? undefined : (editForm.due_date as string))}
              onSelect={(date) => {
                if (date) {
                  setEditForm({ ...editForm, due_date: formatLocalDate(date) });
                  setShowCalendarEditForm(false);
                }
              }}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              classNames={CALENDAR_CLASS_NAMES}
            />
          </PopoverContent>
        </Popover>
      </div>
      <Button onClick={handleSaveEdit} disabled={isSavingEdit}
        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl w-full h-10 disabled:opacity-70">
        {isSavingEdit ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
      </Button>
    </div>
  );

  // ─── Edit form (compact variant) ───────────────────────────────────────────
  const renderCompactEditForm = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
        <Input value={editForm.title ?? ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
        <Textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
          <select value={editForm.type ?? item.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as WorkItem['type'] })}
            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
            <option value="user_story">Story</option>
            <option value="task">Task</option>
            <option value="bug">Bug</option>
            <option value="epic">Epic</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
          <select value={editForm.priority ?? item.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as WorkItem['priority'] })}
            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
          <Input type="number" value={editForm.story_points ?? 0}
            onChange={(e) => setEditForm({ ...editForm, story_points: parseInt(e.target.value) || 0 })}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
          <Input type="number" value={editForm.assigned_hours ?? 0}
            onChange={(e) => setEditForm({ ...editForm, assigned_hours: parseInt(e.target.value) || 0 })}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Status</label>
        <select value={editForm.status ?? item.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as WorkItem['status'] })}
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
        <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
          <PopoverTrigger asChild>
            <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
              <Calendar className="w-4 h-4 mr-2" />
              {editForm.due_date ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]" align="start">
            <CalendarIcon
              mode="single"
              selected={parseLocalDate(editForm.due_date === null ? undefined : (editForm.due_date as string | undefined))}
              onSelect={(date) => { if (date) { setEditForm({ ...editForm, due_date: formatLocalDate(date) }); setShowCalendarEditForm(false); } }}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              classNames={CALENDAR_CLASS_NAMES}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
        <select
          value={editForm.assignee_id ?? item.assignee_id ?? ''}
          onChange={(e) => setEditForm({ ...editForm, assignee_id: e.target.value ? parseInt(e.target.value) : null })}
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {compactEditDevs.map((dev) => (
            <option key={dev.id} value={dev.id}>{dev.name} ({dev.role})</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3 pt-2">
        <Button onClick={handleSaveEdit} disabled={isSavingEdit}
          className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl h-10 font-medium">
          {isSavingEdit ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button onClick={() => { setIsEditing(false); setEditForm({}); setCompactEditDevs([]); }} variant="outline"
          className="flex-1 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#a3a3a3] hover:text-white rounded-xl h-10">
          Cancel
        </Button>
      </div>
    </div>
  );

  // ─── View mode ─────────────────────────────────────────────────────────────
  const renderViewMode = () => (
    <>
      {/* Title + description */}
      <div className="pb-4 border-b border-[rgba(255,255,255,0.05)]">
        <h2 className="text-xl font-bold text-white mb-3">{item.title}</h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {itemDetail.description
            ? <span className="text-[#a3a3a3]">{renderTextWithNewlines(itemDetail.description)}</span>
            : <span className="text-[#555] italic">No description — click Edit to add one.</span>
          }
        </p>
      </div>

      {/* Status + priority pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
          style={{ color: statusConfig.color, borderColor: `${statusConfig.color}40`, backgroundColor: `${statusConfig.color}15` }}>
          <statusConfig.icon className="w-3 h-3" />
          {statusConfig.label}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
          style={{ color: priorityColor, borderColor: `${priorityColor}40`, backgroundColor: `${priorityColor}15` }}>
          {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
        </span>
      </div>

      {/* Stat grid — Story Points, Due Date, Hours */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-1">Story Points</dt>
            <dd className="text-lg font-bold text-[#a3a3a3]">{item.story_points}</dd>
          </dl>
        </div>
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-1">Due Date</dt>
            <dd className="text-lg font-bold" style={{
              color: (() => {
                if (!itemDetail.due_date) return '#555';
                const d = parseLocalDate(itemDetail.due_date);
                if (!d) return '#E0B954';
                const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
                return diffDays < 0 ? '#EF4444' : diffDays <= 7 ? '#F59E0B' : '#34D399';
              })(),
            }}>
              {itemDetail.due_date ? (parseLocalDate(itemDetail.due_date)?.toLocaleDateString() ?? 'Not set') : 'Not set'}
            </dd>
          </dl>
        </div>
        {/* Hours card — full width */}
        {item.type !== 'epic' && (
          <div className="col-span-2 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
            <dl>
              <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-2">Hours</dt>
              <dd>
                {(() => {
                  const allocated = item.assigned_hours || 0;
                  const logged = item.logged_hours || 0;
                  const pct = allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
                  const barColor = pct >= 100 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#34D399';
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#8A8A8A]">
                        <span><span className="text-white font-semibold">{logged}h</span> logged</span>
                        <span><span className="text-white font-semibold">{item.remaining_hours}h</span> remaining of {allocated}h</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                    </div>
                  );
                })()}
              </dd>
            </dl>
          </div>
        )}
      </div>

      {/* Metadata rows */}
      <div className="space-y-3">
        {[
          { label: 'Assignee', value: item.assignee || 'Unassigned' },
          ...(itemDetail.reporter_name ? [{ label: 'Created By', value: itemDetail.reporter_name }] : []),
          { label: 'Sprint', value: itemDetail.sprint || 'None' },
        ].map((m) => (
          <div key={m.label} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)]">
            <span className="text-xs text-[#8A8A8A]">{m.label}</span>
            <span className="text-sm text-[#f5f5f5]">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Hierarchy — full: clickable rows; compact: key pills */}
      {props.variant === 'full' ? renderFullHierarchy() : renderCompactHierarchy()}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div>
          <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Tags</div>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Log Hours (assignee only) */}
      {isAssignee && (
        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">Log Work Hours</div>
          <div className="flex items-center gap-3">
            <label htmlFor={`log-hours-${item.id}`} className="sr-only">Hours to log</label>
            <Input
              ref={logHoursRef}
              id={`log-hours-${item.id}`}
              type="number"
              placeholder="Hours"
              min="0"
              max="24"
              className="w-24 h-9 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              aria-describedby={`log-hours-status-${item.id}`}
            />
            <Button size="sm" disabled={isLoggingHours} onClick={handleLogHours}
              className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl h-9 disabled:opacity-50">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {isLoggingHours ? 'Logging…' : 'Log Hours'}
            </Button>
          </div>
          <p id={`log-hours-status-${item.id}`} className="text-xs text-[#8A8A8A] mt-2">
            <span className="text-white font-medium">{item.logged_hours || 0}h</span> logged ·{' '}
            <span className="text-white font-medium">{item.remaining_hours}h</span> remaining
          </p>
        </div>
      )}

      {/* Contributors (full only) */}
      {props.variant === 'full' && (
        <TicketContributors workItemId={item.id} token={token || ''} />
      )}

      {/* Status buttons */}
      <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
          Status
          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: statusConfig.color, backgroundColor: `${statusConfig.color}20` }}>
            {statusConfig.label}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(STATUS_CONFIG).filter(s => s !== 'backlog') as Array<keyof typeof STATUS_CONFIG>).map((status) => (
            <Button key={status} size="sm"
              onClick={() => handleStatusChange(status)}
              aria-pressed={item.status === status}
              className={`rounded-lg text-xs h-9 transition-all ${item.status === status
                ? 'text-white shadow-lg'
                : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'}`}
              style={item.status === status ? { backgroundColor: STATUS_CONFIG[status].color, boxShadow: `0 4px 12px ${STATUS_CONFIG[status].color}33` } : {}}
            >
              {STATUS_CONFIG[status].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Sprint actions (full only) */}
      {props.variant === 'full' && renderSprintActions()}

      {/* Subtasks (full only) */}
      {props.variant === 'full' && canHaveSubtasks && renderSubtasks()}

      {/* Parent backlink (full only, when item is a subtask) */}
      {props.variant === 'full' && item.type === 'subtask' && parentOfCurrent && (
        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Parent</div>
          <div className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)]">
            <span className="text-[11px] text-[#737373] font-mono">{parentOfCurrent.key}</span>
            <span className="text-sm text-white truncate">{parentOfCurrent.title}</span>
          </div>
        </div>
      )}

      {/* Comments */}
      {renderComments()}
    </>
  );

  // ─── Full hierarchy (clickable rows) ──────────────────────────────────────
  const renderFullHierarchy = () => {
    if (props.variant !== 'full') return null;
    const subjectType = item.type;
    const subjectId = parseInt(item.id);
    const showEpicSlot = fieldSupportsType(subjectType, 'epic_id');
    const showParentSlot = fieldSupportsType(subjectType, 'parent_id');
    const showChildSlot = subjectType !== 'bug';
    if (!showEpicSlot && !showParentSlot && !showChildSlot) return null;

    const epicItem = item.epic_id ? fullWorkItems.find((wi) => wi.id === item.epic_id?.toString()) : null;
    const parentItem = item.parent_id ? fullWorkItems.find((wi) => wi.id === item.parent_id?.toString()) : null;
    const childItems = !showChildSlot ? [] : subjectType === 'epic'
      ? fullWorkItems.filter((wi) => wi.epic_id === subjectId)
      : fullWorkItems.filter((wi) => wi.parent_id === subjectId);

    const renderRow = (target: WorkItem) => (
      <div key={target.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] cursor-pointer hover:border-[rgba(255,255,255,0.08)] transition-colors"
        onClick={() => props.variant === 'full' && props.navigate(`/project/${props.projectId}/board/${target.id}`)}>
        <span className="text-xs font-mono text-[#737373] flex-shrink-0">{target.key}</span>
        <span className="text-sm text-[#a3a3a3] truncate flex-1">{target.title}</span>
        <span className="text-xs text-[#555] capitalize flex-shrink-0">{target.status.replace(/_/g, ' ')}</span>
      </div>
    );

    const renderEmpty = (label: string) => (
      <div className="flex items-center px-3 py-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.06)] text-xs text-[#555] italic">{label}</div>
    );

    return (
      <div className="space-y-4">
        {showEpicSlot && (
          <div>
            <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Epic</div>
            {epicItem ? renderRow(epicItem) : renderEmpty('No epic')}
          </div>
        )}
        {showParentSlot && (
          <div>
            <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Belongs to</div>
            {parentItem ? renderRow(parentItem) : renderEmpty('No parent')}
          </div>
        )}
        {showChildSlot && (
          <div>
            <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Child Items{childItems.length > 0 ? ` (${childItems.length})` : ''}</div>
            {childItems.length > 0 ? <div className="space-y-1.5">{childItems.map(renderRow)}</div> : renderEmpty('No child items')}
          </div>
        )}
      </div>
    );
  };

  // ─── Compact hierarchy (static key pills) ─────────────────────────────────
  const renderCompactHierarchy = () => {
    if (!item.epic_key && !item.parent_key) return null;
    return (
      <div>
        <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Hierarchy</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.epic_key && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(167,139,250,0.12)] text-[#A78BFA] text-xs">Epic: {item.epic_key}</span>
          )}
          {item.epic_key && item.parent_key && <span className="text-[#555] text-xs">›</span>}
          {item.parent_key && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(224,185,84,0.10)] text-[#E0B954] text-xs">Parent: {item.parent_key}</span>
          )}
        </div>
      </div>
    );
  };

  // ─── Sprint actions (full only) ────────────────────────────────────────────
  const renderSprintActions = () => {
    if (props.variant !== 'full') return null;
    const { sprints, onMoveToSprint, getNextSprint } = props;
    if (sprints.length === 0) return null;

    const nextSprintId = item.sprint_id ? getNextSprint(item.sprint_id) : null;
    const hasAnyAction = item.sprint_id || !item.sprint_id;
    if (!hasAnyAction) return null;

    return (
      <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">Sprint</div>
        <div className="flex flex-wrap gap-2">
          {item.sprint_id && nextSprintId && item.status !== 'done' && (
            <Button size="sm" onClick={() => onMoveToSprint(item.id, nextSprintId)}
              className="rounded-lg text-xs h-9 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.2)]">
              <ArrowRight className="w-3 h-3 mr-1" /> Push to Next Sprint
            </Button>
          )}
          {item.sprint_id && (
            <Button size="sm" onClick={() => onMoveToSprint(item.id, null)}
              className="rounded-lg text-xs h-9 bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]">
              <Inbox className="w-3 h-3 mr-1" /> Remove from Sprint
            </Button>
          )}
          {!item.sprint_id && (
            <select onChange={(e) => { if (e.target.value) { onMoveToSprint(item.id, parseInt(e.target.value)); e.target.value = ''; } }}
              className="h-9 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#a3a3a3] rounded-lg px-3 appearance-none cursor-pointer hover:border-[rgba(244,246,255,0.15)]"
              defaultValue="">
              <option value="">Add to Sprint…</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>
    );
  };

  // ─── Subtasks (full only) ──────────────────────────────────────────────────
  const renderSubtasks = () => {
    if (props.variant !== 'full') return null;
    return (
      <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-[#8A8A8A] font-semibold uppercase tracking-wider">
            Subtasks{subtasksOfCurrent.length > 0 && <span className="ml-1.5 text-[#525252]">({subtasksOfCurrent.length})</span>}
          </div>
        </div>
        {subtasksOfCurrent.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {subtasksOfCurrent.map((st) => {
              const stConf = STATUS_CONFIG[st.status as keyof typeof STATUS_CONFIG];
              return (
                <li key={st.id} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)]">
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ color: stConf?.color ?? '#737373', background: `${stConf?.color ?? '#737373'}1a` }}>
                    {stConf?.label ?? st.status}
                  </span>
                  <span className="text-[11px] text-[#737373] font-mono">{st.key}</span>
                  <span className="text-sm text-white truncate flex-1">{st.title}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input value={newSubtask.title} onChange={(e) => setNewSubtask((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && newSubtask.title.trim()) { e.preventDefault(); createSubtask.mutate({ ...newSubtask, title: newSubtask.title.trim() }); } }}
              placeholder="Add a subtask…" disabled={createSubtask.isPending}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 text-sm flex-1"
            />
            <Button size="sm" onClick={() => { if (newSubtask.title.trim()) createSubtask.mutate({ ...newSubtask, title: newSubtask.title.trim() }); }}
              disabled={createSubtask.isPending || !newSubtask.title.trim()}
              className="bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] rounded-xl h-9 px-3 disabled:opacity-50">
              <Plus className="w-3.5 h-3.5 mr-1" />
              {createSubtask.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select value={newSubtask.assignee_id ?? ''} onChange={(e) => setNewSubtask((f) => ({ ...f, assignee_id: e.target.value ? parseInt(e.target.value) : null }))}
              disabled={createSubtask.isPending} title="Assignee"
              className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-2 text-xs">
              <option value="">Unassigned</option>
              {(props.variant === 'full' ? props.project?.developers : [])?.map((dev) => (
                <option key={dev.id} value={dev.id}>{dev.name}</option>
              ))}
            </select>
            <Input type="number" min={0} max={999} value={newSubtask.estimated_hours}
              onChange={(e) => setNewSubtask((f) => ({ ...f, estimated_hours: e.target.value }))}
              disabled={createSubtask.isPending} placeholder="Hours" title="Estimated hours"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 text-xs"
            />
            <Popover open={showSubtaskDatePicker} onOpenChange={setShowSubtaskDatePicker}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" disabled={createSubtask.isPending}
                  className="h-9 w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white rounded-xl px-2 text-xs">
                  <Calendar className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                  <span className="truncate">{newSubtask.due_date ? parseLocalDate(newSubtask.due_date)?.toLocaleDateString() : 'Pick a date'}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]">
                <CalendarIcon mode="single" selected={parseLocalDate(newSubtask.due_date || undefined)}
                  onSelect={(date) => { if (date) { setNewSubtask((f) => ({ ...f, due_date: formatLocalDate(date) })); setShowSubtaskDatePicker(false); } }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  classNames={CALENDAR_CLASS_NAMES}
                />
                {newSubtask.due_date && (
                  <div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.05)]">
                    <Button size="sm" variant="ghost" onClick={() => { setNewSubtask((f) => ({ ...f, due_date: '' })); setShowSubtaskDatePicker(false); }}
                      className="w-full text-xs text-[#737373] hover:text-white">Clear date</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    );
  };

  // ─── Comments ──────────────────────────────────────────────────────────────
  const renderComments = () => (
    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">Activity &amp; Comments</div>
      <div className="relative mb-4">
        <Textarea value={newComment} onChange={handleCommentChange}
          placeholder="Add a comment… Use @ to mention someone"
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
        />
        {showMentions && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1D26] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
            {allDevelopers.filter((d) => d.name.toLowerCase().includes(mentionFilter.toLowerCase())).slice(0, 5).map((dev) => (
              <button key={dev.id} onClick={() => insertMention(dev)}
                className="w-full px-3 py-2 text-left text-sm text-[#f5f5f5] hover:bg-[rgba(224,185,84,0.1)] flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-xs text-[#E0B954]">
                  {dev.name.charAt(0).toUpperCase()}
                </div>
                <span>{dev.name}</span>
                <span className="text-[#737373] text-xs ml-auto">{dev.email}</span>
              </button>
            ))}
            {allDevelopers.filter((d) => d.name.toLowerCase().includes(mentionFilter.toLowerCase())).length === 0 && (
              <div className="px-3 py-2 text-sm text-[#737373]">No matching developers</div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <Button size="sm" onClick={() => handleSubmitComment('comment')} disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8">
            <MessageSquare className="w-3 h-3 mr-1" /> Comment
          </Button>
          <Button size="sm" onClick={() => handleSubmitComment('blocker')} disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.2)] rounded-lg text-xs h-8">
            <AlertCircle className="w-3 h-3 mr-1" /> Report Blocker
          </Button>
          <Button size="sm" onClick={() => handleSubmitComment('business_review')} disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)] rounded-lg text-xs h-8">
            <Target className="w-3 h-3 mr-1" /> Business Review
          </Button>
        </div>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-[#737373] text-sm">No comments yet. Be the first to comment!</div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className={`p-3 rounded-xl ${
              comment.comment_type === 'blocker' ? 'bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)]'
              : comment.comment_type === 'business_review' ? 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'
              : 'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  comment.comment_type === 'blocker' ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]'
                  : comment.comment_type === 'business_review' ? 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'
                  : 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]'
                }`}>
                  {comment.author_name?.charAt?.(0)?.toUpperCase() || '?'}
                </div>
                <span className="text-sm font-medium text-[#f5f5f5]">{comment.author_name}</span>
                {comment.comment_type === 'blocker' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[rgba(239,68,68,0.2)] text-[#EF4444] text-[10px] font-medium">BLOCKER</span>
                )}
                {comment.comment_type === 'business_review' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[rgba(167,139,250,0.2)] text-[#A78BFA] text-[10px] font-medium">BUSINESS REVIEW</span>
                )}
                <span className="text-xs text-[#737373] ml-auto">{new Date(comment.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-[#a3a3a3] leading-relaxed">
                {renderCommentContent(comment.content, comment.mentions, devMap)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  const isDoneAndNotEditing = item.status === 'done' && !isEditing;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={`fixed right-0 top-0 bottom-0 w-full ${props.variant === 'full' ? 'max-w-xl animate-in slide-in-from-right duration-300' : 'max-w-lg'} bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50`}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: typeConfig.bg, color: typeConfig.color }}>
              <typeConfig.icon className="w-4 h-4" />
              {typeConfig.label}
            </div>
            <span className="text-sm font-mono text-[#E0B954]">{item.key}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Edit (full variant — in header) */}
            {props.variant === 'full' && (
              <Button size="sm" variant="ghost"
                disabled={isDoneAndNotEditing}
                title={isDoneAndNotEditing ? 'Re-open this ticket before editing.' : undefined}
                onClick={() => { if (isEditing) { setIsEditing(false); setEditForm({}); } else { startEditing(); } }}
                className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
                <Pencil className="w-3.5 h-3.5 mr-1" />
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            )}
            {/* Delete (full only) */}
            {props.variant === 'full' && (
              <Button size="sm" variant="ghost" aria-label="Delete work item"
                onClick={() => props.variant === 'full' && props.onDeleteItem(item.id)}
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg h-8 px-2.5">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close panel"
              className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isEditing
            ? (props.variant === 'full' ? renderFullEditForm() : renderCompactEditForm())
            : renderViewMode()
          }
        </div>

        {/* Footer (compact only: Edit + Open ticket) */}
        {props.variant === 'compact' && !isEditing && (
          <div className="flex-shrink-0 p-4 border-t border-[rgba(255,255,255,0.05)] flex gap-3">
            <button
              onClick={startEditing}
              disabled={isDoneAndNotEditing}
              title={isDoneAndNotEditing ? 'Re-open this ticket before editing.' : undefined}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-white font-semibold text-sm hover:bg-[rgba(255,255,255,0.08)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => props.variant === 'compact' && props.onOpenInBoard((item as WorkItem & { project_id?: number }).project_id ?? 0, item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold text-sm hover:opacity-90 transition-opacity">
              <ExternalLink className="w-4 h-4" />
              Open ticket
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default WorkItemPanel;
