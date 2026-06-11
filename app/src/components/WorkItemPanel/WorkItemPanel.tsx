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
  ClipboardList,
  Link2,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
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
import { useAuth } from '@/contexts/AuthContext';
import { useAllDevelopers } from '@/hooks/useAllDevelopers';
import { toastErrorHandler } from '@/lib/mutationToast';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { TYPE_CONFIG, STATUS_CONFIG, PRIORITY_COLOR, CALENDAR_CLASS_NAMES } from './constants';
import type {
  WorkItem,
  Sprint,
  AllDeveloper,
  ProjectLite,
  Comment,
  ProjectDeveloper,
} from './types';
import { AddSubtaskModal } from './AddSubtaskModal';
import type { AddSubtaskFormValues } from './AddSubtaskModal';

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
        <span
          key={`m-${idx++}`}
          className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium"
        >
          @{devMap.get(parseInt(mm[1]))}
        </span>
      );
    }
    const um = part.match(/<<<U_(\d+)>>>/);
    if (um) {
      const url = urls[parseInt(um[1])];
      return (
        <a
          key={`u-${idx++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all"
        >
          {url}
        </a>
      );
    }
    return part
      .split('\n')
      .flatMap((line, li, arr) => [
        <span key={`t-${idx}-${li}`}>{line}</span>,
        li < arr.length - 1 ? <br key={`tb-${idx}-${li}`} /> : null,
      ])
      .filter(Boolean);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const WorkItemPanel = (props: WorkItemPanelProps) => {
  const { item, token, currentUserId, onClose } = props;
  const queryClient = useQueryClient();
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
  const [compactEditDevs, setCompactEditDevs] = useState<ProjectDeveloper[]>([]);

  const [showAddSubtaskModal, setShowAddSubtaskModal] = useState(false);

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

  const developersQuery = useAllDevelopers<AllDeveloper>();
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
        if (!Number.isNaN(cn) && !ex.has(cn)) {
          ex.add(cn);
          queue.push(cn);
        }
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

  // ─── Compact mutations ─────────────────────────────────────────────────────
  const invalidateWorkItems = () => {
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  };

  const saveEditCompact = useMutation({
    mutationFn: (edits: Partial<WorkItem>) =>
      apiFetch<WorkItem>(`/api/workitems/${item.id}`, {
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
    onError: toastErrorHandler('update task'),
  });

  const statusChangeCompact = useMutation({
    mutationFn: (newStatus: string) =>
      apiFetch<WorkItem>(`/api/workitems/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: (updated: WorkItem) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...updated });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
    },
    onError: toastErrorHandler('update status'),
  });

  const logHoursCompact = useMutation({
    mutationFn: (hours: number) =>
      apiFetch<{ logged_hours: number; remaining_hours: number }>(
        `/api/workitems/${item.id}/log-hours`,
        {
          method: 'POST',
          body: JSON.stringify({ hours }),
        },
      ),
    onSuccess: (data: { logged_hours: number; remaining_hours: number }) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...data });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      toast.success(`Logged hours!`);
      if (logHoursRef.current) logHoursRef.current.value = '';
    },
    onError: toastErrorHandler('log hours'),
  });

  // ─── Full-variant subtask mutation ─────────────────────────────────────────
  const createSubtask = useMutation({
    mutationFn: (form: AddSubtaskFormValues) => {
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
      setShowAddSubtaskModal(false);
      toast.success('Subtask added');
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
    },
    onError: toastErrorHandler('create subtask'),
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
    onError: toastErrorHandler('add comment'),
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
          setCompactEditDevs((data as { developers?: ProjectDeveloper[] }).developers ?? []);
        }
      } catch {
        /* proceed without project devs */
      }
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
      if (!after.includes(' ')) {
        setMentionFilter(after);
        setShowMentions(true);
      } else setShowMentions(false);
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
  const priorityColor = PRIORITY_COLOR[item.priority] ?? '#737373';
  const AVATAR_PALETTE = ['#E0B954', '#60A5FA', '#34D399', '#A78BFA', '#F97316', '#F43F5E'];
  const avatarColor = (id: number | null | undefined) =>
    AVATAR_PALETTE[(id ?? 0) % AVATAR_PALETTE.length];

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
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
          <select
            defaultValue={item.priority}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, priority: e.target.value as WorkItem['priority'] }))
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
      <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
          <NumberInput
            defaultValue={item.story_points}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, story_points: parseInt(e.target.value) || 0 }))
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
        {item.type !== 'epic' && (
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Allocated Hours
            </label>
            <NumberInput
              defaultValue={item.assigned_hours}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, assigned_hours: parseInt(e.target.value) || 0 }))
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
        )}
      </div>
      {item.type !== 'epic' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Logged Hours</label>
            <NumberInput
              defaultValue={item.logged_hours || 0}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, logged_hours: parseInt(e.target.value) || 0 }))
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Remaining Hours
            </label>
            <NumberInput
              defaultValue={item.remaining_hours}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, remaining_hours: parseInt(e.target.value) || 0 }))
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
        <select
          value={editForm.assignee_id ?? item.assignee_id ?? ''}
          onChange={(e) =>
            setEditForm((f) => ({
              ...f,
              assignee_id: e.target.value ? parseInt(e.target.value) : null,
            }))
          }
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {(props.variant === 'full' ? props.project?.developers : [])?.map((dev) => (
            <option key={dev.id} value={dev.id}>
              {dev.name} ({dev.role})
            </option>
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
            allowedTypes={getAllowedTargetTypes(
              (editForm.type ?? item.type) as WorkItem['type'],
              'epic_id',
            )}
            excludeIds={epicExcludeIds}
            onChange={(newId, newKey) => {
              const target =
                newId != null
                  ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null)
                  : null;
              const v = validateReparent(
                { ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] },
                target,
                'epic_id',
                fullWorkItems,
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
      {fieldSupportsType((editForm.type ?? item.type) as WorkItem['type'], 'parent_id') && (
        <div>
          <label
            className="text-xs font-medium text-[#737373] block mb-1.5"
            title="This task is part of a larger story or task."
          >
            Belongs to
          </label>
          <WorkItemCombobox
            value={editForm.parent_id ?? item.parent_id ?? null}
            valueKey={editForm.parent_key ?? item.parent_key ?? null}
            items={fullWorkItems}
            allowedTypes={getAllowedTargetTypes(
              (editForm.type ?? item.type) as WorkItem['type'],
              'parent_id',
            )}
            excludeIds={parentExcludeIds}
            disabled={selectedItemHasChildren}
            onChange={(newId, newKey) => {
              const target =
                newId != null
                  ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null)
                  : null;
              const v = validateReparent(
                { ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] },
                target,
                'parent_id',
                fullWorkItems,
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
              This task already has child tasks, so it can't be nested under another item.
            </p>
          )}
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
        <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
          <PopoverTrigger asChild>
            <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
              <Calendar className="w-4 h-4 mr-2" />
              {editForm.due_date
                ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
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
      <Button
        onClick={handleSaveEdit}
        disabled={isSavingEdit}
        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl w-full h-10 disabled:opacity-70"
      >
        {isSavingEdit ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </>
        )}
      </Button>
    </div>
  );

  // ─── Edit form (compact variant) ───────────────────────────────────────────
  const renderCompactEditForm = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
        <Input
          value={editForm.title ?? ''}
          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
        <Textarea
          value={editForm.description ?? ''}
          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
          <select
            value={editForm.type ?? item.type}
            onChange={(e) => setEditForm({ ...editForm, type: e.target.value as WorkItem['type'] })}
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
            value={editForm.priority ?? item.priority}
            onChange={(e) =>
              setEditForm({ ...editForm, priority: e.target.value as WorkItem['priority'] })
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
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
          <NumberInput
            value={editForm.story_points ?? 0}
            onChange={(e) =>
              setEditForm({ ...editForm, story_points: parseInt(e.target.value) || 0 })
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
          <NumberInput
            value={editForm.assigned_hours ?? 0}
            onChange={(e) =>
              setEditForm({ ...editForm, assigned_hours: parseInt(e.target.value) || 0 })
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Status</label>
        <select
          value={editForm.status ?? item.status}
          onChange={(e) =>
            setEditForm({ ...editForm, status: e.target.value as WorkItem['status'] })
          }
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
        >
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
              {editForm.due_date
                ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
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
                editForm.due_date === null ? undefined : (editForm.due_date as string | undefined),
              )}
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
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
        <select
          value={editForm.assignee_id ?? item.assignee_id ?? ''}
          onChange={(e) =>
            setEditForm({
              ...editForm,
              assignee_id: e.target.value ? parseInt(e.target.value) : null,
            })
          }
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {compactEditDevs.map((dev) => (
            <option key={dev.id} value={dev.id}>
              {dev.name} ({dev.role})
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-3 pt-2">
        <Button
          onClick={handleSaveEdit}
          disabled={isSavingEdit}
          className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl h-10 font-medium"
        >
          {isSavingEdit ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button
          onClick={() => {
            setIsEditing(false);
            setEditForm({});
            setCompactEditDevs([]);
          }}
          variant="outline"
          className="flex-1 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#a3a3a3] hover:text-white rounded-xl h-10"
        >
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
        <h2 className="text-xl font-bold text-white mb-2">{item.title}</h2>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
            style={{
              backgroundColor: `${avatarColor(item.assignee_id)}20`,
              color: avatarColor(item.assignee_id),
            }}
          >
            {item.assignee ? item.assignee.charAt(0).toUpperCase() : '—'}
          </div>
          <span className="text-sm text-[#a3a3a3]">{item.assignee || 'Unassigned'}</span>
          {/* Assign-to-me quick action — surfaces only when the ticket has
              no assignee (and isn't an epic, and the viewer has a Developer
              row). Routes through the same save path as the inline Edit
              form, so cache / toast / invalidation behave identically. */}
          {canAssignToMe && (
            <button
              type="button"
              onClick={handleAssignToMe}
              disabled={isSavingEdit}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-[rgba(224,185,84,0.12)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] disabled:opacity-50 transition-colors"
            >
              Assign to me
            </button>
          )}
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {itemDetail.description ? (
            <span className="text-[#a3a3a3]">{renderTextWithNewlines(itemDetail.description)}</span>
          ) : (
            <span className="text-[#555] italic">No description — click Edit to add one.</span>
          )}
        </p>
      </div>

      {/* Status buttons */}
      <div className="pt-4">
        <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
          Status
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            Object.keys(STATUS_CONFIG).filter((s) => s !== 'backlog') as Array<
              keyof typeof STATUS_CONFIG
            >
          ).map((status) => (
            <Button
              key={status}
              size="sm"
              onClick={() => handleStatusChange(status)}
              aria-pressed={item.status === status}
              className={`rounded-lg text-xs h-9 transition-all ${
                item.status === status
                  ? 'text-white shadow-lg'
                  : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'
              }`}
              style={
                item.status === status
                  ? {
                      backgroundColor: STATUS_CONFIG[status].color,
                      boxShadow: `0 4px 12px ${STATUS_CONFIG[status].color}33`,
                    }
                  : {}
              }
            >
              {STATUS_CONFIG[status].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stat grid — Story Points, Priority, Due Date, Hours */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-1">
              Story Points
            </dt>
            <dd className="text-lg font-bold text-[#a3a3a3]">{item.story_points}</dd>
          </dl>
        </div>
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-1">
              Priority
            </dt>
            <dd className="text-lg font-bold" style={{ color: priorityColor }}>
              {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
            </dd>
          </dl>
        </div>
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-1">
              Due Date
            </dt>
            <dd
              className="text-lg font-bold"
              style={{
                color: (() => {
                  if (!itemDetail.due_date) return '#555';
                  const d = parseLocalDate(itemDetail.due_date);
                  if (!d) return '#E0B954';
                  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
                  return diffDays < 0 ? '#EF4444' : diffDays <= 7 ? '#F59E0B' : '#34D399';
                })(),
              }}
            >
              {itemDetail.due_date
                ? (parseLocalDate(itemDetail.due_date)?.toLocaleDateString() ?? 'Not set')
                : 'Not set'}
            </dd>
          </dl>
        </div>
        {/* Hours card — full width */}
        {item.type !== 'epic' && (
          <div className="col-span-3 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
            <dl>
              <dt className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider mb-2">
                Hours
              </dt>
              <dd>
                {(() => {
                  const allocated = item.assigned_hours || 0;
                  const logged = item.logged_hours || 0;
                  const pct =
                    allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
                  const barColor = pct >= 100 ? '#34D399' : '#E0B954';
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#8A8A8A]">
                        <span>
                          <span className="text-white font-semibold">{logged}h</span> logged
                        </span>
                        <span>
                          <span className="text-white font-semibold">{item.remaining_hours}h</span>{' '}
                          remaining of {allocated}h
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </dd>
            </dl>
          </div>
        )}
      </div>

      {/* Log Work Hours — directly below hours card for quick access */}
      {(props.variant === 'compact' || isAssignee) && item.type !== 'epic' && (
        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
            Log Work Hours
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor={`log-hours-${item.id}`} className="sr-only">
              Hours to log
            </label>
            <NumberInput
              ref={logHoursRef}
              id={`log-hours-${item.id}`}
              placeholder="Hours"
              min="0"
              max="24"
              className="w-28 h-9"
              aria-describedby={`log-hours-status-${item.id}`}
            />
            <Button
              size="sm"
              disabled={isLoggingHours}
              onClick={handleLogHours}
              className="bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium rounded-xl h-9 disabled:opacity-50"
            >
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

      {/* Metadata rows */}
      {itemDetail.reporter_name && (
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)]">
            <span className="text-xs text-[#8A8A8A]">Created By</span>
            <span className="text-sm text-[#f5f5f5]">{itemDetail.reporter_name}</span>
          </div>
        </div>
      )}

      {/* Linked Items */}
      {props.variant === 'full' ? (
        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
            Linked Items
          </div>
          {renderFullHierarchy()}
        </div>
      ) : (
        renderCompactHierarchy() && (
          <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
            <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
              Linked Items
            </div>
            {renderCompactHierarchy()}
          </div>
        )
      )}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div>
          <div className="text-xs text-[#8A8A8A] mb-2 font-medium">Tags</div>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
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

      {/* Contributors (full only) */}
      {props.variant === 'full' && <TicketContributors workItemId={item.id} token={token || ''} />}

      {/* Sprint actions (full only) */}
      {props.variant === 'full' && renderSprintActions()}

      {/* Comments */}
      {renderComments()}
    </>
  );

  // ─── Full hierarchy (clickable rows, type-specific) ──────────────────────
  const renderFullHierarchy = () => {
    if (props.variant !== 'full') return null;
    const subjectType = item.type;
    const subjectId = parseInt(item.id);

    const epicItem = item.epic_id
      ? fullWorkItems.find((wi) => wi.id === item.epic_id?.toString())
      : null;

    const renderEmpty = (label: string) => (
      <div className="flex items-center px-3 py-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.06)] text-xs text-[#555] italic">
        {label}
      </div>
    );

    const sectionLabel = (icon: React.ReactNode, text: string) => (
      <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
        {icon}
        {text}
      </div>
    );

    // Shared row renderer: avatar · key+title+progress · status badge
    const renderItemRow = (target: WorkItem) => {
      const sc = STATUS_CONFIG[target.status as keyof typeof STATUS_CONFIG];
      const allocated = target.assigned_hours ?? 0;
      const logged = target.logged_hours ?? 0;
      const pct = allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
      const barColor = logged >= allocated && allocated > 0 ? '#34D399' : '#E0B954';
      const ac = avatarColor(target.assignee_id);
      return (
        <div
          key={target.id}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] cursor-pointer hover:border-[rgba(255,255,255,0.1)] transition-colors"
          onClick={() => props.navigate(`/project/${props.projectId}/board/${target.id}`)}
        >
          {/* Assignee avatar */}
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
            style={{ backgroundColor: `${ac}20`, color: ac }}
          >
            {target.assignee ? target.assignee.charAt(0).toUpperCase() : '—'}
          </div>
          {/* Key + title + progress bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] text-[#737373] font-mono flex-shrink-0">
                {target.key}
              </span>
              <span className="text-sm text-white truncate">{target.title}</span>
            </div>
            <div className="h-1 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
          {/* Hours — logged / allocated */}
          <span className="text-[11px] text-[#555] flex-shrink-0 tabular-nums">
            {logged}h/{allocated}h
          </span>
          {/* Status badge — right end */}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide flex-shrink-0"
            style={{ color: sc?.color ?? '#737373', background: `${sc?.color ?? '#737373'}1a` }}
          >
            {sc?.label ?? target.status}
          </span>
        </div>
      );
    };

    // ── Subtask: only show parent ("Belongs to") ──────────────────────────
    if (subjectType === 'subtask') {
      const parentItem = item.parent_id
        ? fullWorkItems.find((wi) => wi.id === item.parent_id?.toString())
        : null;
      return (
        <div>
          {sectionLabel(<Link2 className="w-3.5 h-3.5" />, 'Belongs to')}
          {parentItem ? renderItemRow(parentItem) : renderEmpty('No parent')}
        </div>
      );
    }

    // ── Epic: show member items ───────────────────────────────────────────
    if (subjectType === 'epic') {
      const epicItems = fullWorkItems.filter((wi) => wi.epic_id === subjectId);
      return (
        <div>
          {sectionLabel(
            <List className="w-3.5 h-3.5" />,
            `Items${epicItems.length > 0 ? ` (${epicItems.length})` : ''}`,
          )}
          {epicItems.length > 0 ? (
            <div className="space-y-1.5">{epicItems.map(renderItemRow)}</div>
          ) : (
            renderEmpty('No items')
          )}
        </div>
      );
    }

    // ── Bug / Story / Task: Epic + Subtasks (with creation form) ─────────
    const subtasks = subtasksOfCurrent;
    return (
      <div className="space-y-4">
        <div>
          {sectionLabel(<Target className="w-3.5 h-3.5" />, 'Epic')}
          {epicItem ? renderItemRow(epicItem) : renderEmpty('No epic')}
        </div>
        <div>
          {sectionLabel(
            <ClipboardList className="w-3.5 h-3.5" />,
            `Subtasks${subtasks.length > 0 ? ` (${subtasks.length})` : ''}`,
          )}
          {subtasks.length > 0 && (
            <div className="space-y-1.5 mb-3">{subtasks.map(renderItemRow)}</div>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddSubtaskModal(true)}
            className="w-full border border-dashed border-[rgba(255,255,255,0.08)] text-[#555] hover:bg-[rgba(255,255,255,0.04)] hover:text-white hover:border-[rgba(255,255,255,0.15)] rounded-lg h-9 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a subtask
          </Button>
        </div>
      </div>
    );
  };

  // ─── Compact hierarchy (same card style as full, key-only rows) ──────────
  const renderCompactHierarchy = () => {
    const openInBoard = (relatedId: number | null | undefined) => {
      if (props.variant !== 'compact' || !relatedId) return;
      const projectId = (item as WorkItem & { project_id?: number }).project_id ?? 0;
      props.onOpenInBoard(projectId, String(relatedId));
    };

    // key-only card: type-icon avatar · key · external link
    const renderCompactRow = (
      keyStr: string,
      relatedId: number | null | undefined,
      Icon: React.ElementType,
      accentColor: string,
    ) => (
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] cursor-pointer hover:border-[rgba(255,255,255,0.1)] transition-colors"
        onClick={() => openInBoard(relatedId)}
      >
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
        </div>
        <span className="text-sm font-mono text-[#a3a3a3] flex-1">{keyStr}</span>
        <ExternalLink className="w-3.5 h-3.5 text-[#555] flex-shrink-0" />
      </div>
    );

    if (item.type === 'subtask') {
      if (!item.parent_key) return null;
      return (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
            <Link2 className="w-3.5 h-3.5" /> Belongs to
          </div>
          {renderCompactRow(item.parent_key, item.parent_id, Link2, '#E0B954')}
        </div>
      );
    }

    if (!item.epic_key) return null;
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
          <Target className="w-3.5 h-3.5" /> Epic
        </div>
        {renderCompactRow(item.epic_key, item.epic_id, Target, '#A78BFA')}
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

    // Resolve the current sprint name for display. Falls back to a numeric
    // placeholder if the ticket's sprint isn't in the local sprints array
    // (rare — could happen if the sprint list is stale relative to the item).
    const currentSprint = item.sprint_id
      ? (sprints.find((s) => s.id === item.sprint_id) ?? null)
      : null;
    const currentSprintLabel = currentSprint
      ? currentSprint.name
      : item.sprint_id
        ? `Sprint #${item.sprint_id}`
        : 'Backlog';

    return (
      <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
          Sprint
        </div>
        {/* "Currently in" indicator — shows the sprint the ticket belongs to
            (or "Backlog" when unassigned to a sprint). Gold-tinted when in a
            sprint so it visually anchors the action buttons below; muted gray
            for backlog. */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-[#737373]">Currently in</span>
          {item.sprint_id ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] text-[#E0B954]">
              {currentSprintLabel}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[#a3a3a3]">
              Backlog
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.sprint_id && nextSprintId && item.status !== 'done' && (
            <Button
              size="sm"
              onClick={() => onMoveToSprint(item.id, nextSprintId)}
              className="rounded-lg text-xs h-9 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.2)]"
            >
              <ArrowRight className="w-3 h-3 mr-1" /> Push to Next Sprint
            </Button>
          )}
          {item.sprint_id && (
            <Button
              size="sm"
              onClick={() => onMoveToSprint(item.id, null)}
              className="rounded-lg text-xs h-9 bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]"
            >
              <Inbox className="w-3 h-3 mr-1" /> Remove from Sprint
            </Button>
          )}
          {!item.sprint_id && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onMoveToSprint(item.id, parseInt(e.target.value));
                  e.target.value = '';
                }
              }}
              className="h-9 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#a3a3a3] rounded-lg px-3 appearance-none cursor-pointer hover:border-[rgba(244,246,255,0.15)]"
              defaultValue=""
            >
              <option value="">Add to Sprint…</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  // ─── Comments ──────────────────────────────────────────────────────────────
  const renderComments = () => (
    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
        Activity &amp; Comments
      </div>
      <div className="relative mb-4">
        <Textarea
          value={newComment}
          onChange={handleCommentChange}
          placeholder="Add a comment… Use @ to mention someone"
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
        />
        {showMentions && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1D26] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
            {allDevelopers
              .filter((d) => d.name.toLowerCase().includes(mentionFilter.toLowerCase()))
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
            {allDevelopers.filter((d) => d.name.toLowerCase().includes(mentionFilter.toLowerCase()))
              .length === 0 && (
              <div className="px-3 py-2 text-sm text-[#737373]">No matching developers</div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => handleSubmitComment('comment')}
            disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8"
          >
            <MessageSquare className="w-3 h-3 mr-1" /> Comment
          </Button>
          <Button
            size="sm"
            onClick={() => handleSubmitComment('blocker')}
            disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.2)] rounded-lg text-xs h-8"
          >
            <AlertCircle className="w-3 h-3 mr-1" /> Report Blocker
          </Button>
          <Button
            size="sm"
            onClick={() => handleSubmitComment('business_review')}
            disabled={!newComment.trim() || submitComment.isPending}
            className="bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)] rounded-lg text-xs h-8"
          >
            <Target className="w-3 h-3 mr-1" /> Business Review
          </Button>
        </div>
      </div>
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
                <span className="text-sm font-medium text-[#f5f5f5]">{comment.author_name}</span>
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
      <div
        className={`fixed right-0 top-0 bottom-0 w-full ${props.variant === 'full' ? 'max-w-xl animate-in slide-in-from-right duration-300' : 'max-w-lg'} bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: typeConfig.bg, color: typeConfig.color }}
            >
              <typeConfig.icon className="w-4 h-4" />
              {typeConfig.label}
            </div>
            <span className="text-sm font-mono text-[#E0B954]">{item.key}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Edit (full variant — in header). Hidden when caller lacks
                project.tracker_write so users don't see an action that would 403. */}
            {props.variant === 'full' && canWriteTracker && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isDoneAndNotEditing}
                title={isDoneAndNotEditing ? 'Re-open this ticket before editing.' : undefined}
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false);
                    setEditForm({});
                  } else {
                    startEditing();
                  }
                }}
                className="text-[#737373] hover:text-white hover:bg-[rgba(255,255,255,0.06)] rounded-lg h-8 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            )}
            {/* Delete (full only — same capability gate as Edit). */}
            {props.variant === 'full' && canWriteTracker && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete work item"
                onClick={() => props.variant === 'full' && props.onDeleteItem(item.id)}
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg h-8 px-2.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Close panel"
              className="text-[#737373] hover:text-white hover:bg-[rgba(255,255,255,0.06)] rounded-lg h-8 px-2.5"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isEditing
            ? props.variant === 'full'
              ? renderFullEditForm()
              : renderCompactEditForm()
            : renderViewMode()}
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
