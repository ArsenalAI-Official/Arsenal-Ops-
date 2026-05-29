import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Edit2,
  Calendar,
  Clock,
  AlertCircle,
  Target,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import type { MyTask, ProjectDeveloper, Comment, Developer } from './types';
import { parseLocalDate, formatLocalDate } from './utils';
import { TASK_TYPE_CONFIG, STATUS_CONFIG, CALENDAR_CLASS_NAMES } from './constants';

interface TicketDetailPanelProps {
  task: MyTask;
  token: string | null;
  currentUserId: number | null;
  onClose: () => void;
  onTaskChanged: (updated: MyTask) => void;
  onOpenInProjectBoard: (projectId: number, taskId: string) => void;
}

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

const TicketDetailPanel = ({
  task,
  token,
  currentUserId,
  onClose,
  onTaskChanged,
  onOpenInProjectBoard,
}: TicketDetailPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<MyTask>>({});
  const [projectDevelopers, setProjectDevelopers] = useState<ProjectDeveloper[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [allDevelopers, setAllDevelopers] = useState<Developer[]>([]);
  const [isLoggingHours, setIsLoggingHours] = useState(false);
  const commentCache = useRef<Map<string, Comment[]>>(new Map());

  const startEdit = async () => {
    let developers: ProjectDeveloper[] = [];
    try {
      const projectRes = await fetch(`${API_BASE_URL}/api/projects/${task.project_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (projectRes.ok) {
        const projectData = await projectRes.json();
        developers = projectData.developers || [];
        setProjectDevelopers(developers);
      }
    } catch (err) {
      console.error('Failed to fetch project developers:', err);
    }

    let assigneeId: number | null = task.assignee_id || null;
    if (!assigneeId && task.assignee) {
      const matchedDev = developers.find((d) => d.name === task.assignee);
      if (matchedDev) assigneeId = matchedDev.id;
    }

    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || '',
      type: task.type || 'task',
      story_points: task.story_points || 0,
      assigned_hours: task.assigned_hours || 0,
      logged_hours: task.logged_hours || 0,
      remaining_hours: task.remaining_hours || 0,
      assignee_id: assigneeId,
    });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
    setProjectDevelopers([]);
  };

  const saveEdit = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          priority: editForm.priority,
          status: editForm.status,
          due_date: editForm.due_date || null,
          type: editForm.type,
          story_points: editForm.story_points,
          assigned_hours: editForm.assigned_hours,
          logged_hours: editForm.logged_hours,
          remaining_hours: editForm.remaining_hours,
          assignee_id: editForm.assignee_id || null,
        }),
      });
      if (res.ok) {
        const updatedTask = await res.json();
        const merged = { ...task, ...editForm, ...updatedTask } as MyTask;
        onTaskChanged(merged);
        setIsEditing(false);
        toast.success('Task updated successfully');
      } else {
        toast.error('Failed to update task');
      }
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleLogHours = async (hoursToLog: number) => {
    if (isLoggingHours) return;
    setIsLoggingHours(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${task.id}/log-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hours: hoursToLog }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = {
          ...task,
          logged_hours: data.logged_hours,
          remaining_hours: data.remaining_hours,
        } as MyTask;
        onTaskChanged(updated);
        // Backend writes a "Logged Xh" auto-comment alongside the TimeEntry —
        // bust the local cache and refetch so the panel shows it immediately.
        commentCache.current.delete(task.id);
        fetchComments(true);
        toast.success(`Logged ${hoursToLog}h! Remaining: ${data.remaining_hours}h`);
      } else {
        toast.error('Failed to log hours');
      }
    } catch {
      toast.error('Failed to log hours');
    } finally {
      setIsLoggingHours(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const previousStatus = task.status;
    // Optimistic flip
    onTaskChanged({ ...task, status: newStatus } as MyTask);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Revert optimistic flip and surface the backend's detail (e.g.
        // "subtask still open" when marking a parent done).
        onTaskChanged({ ...task, status: previousStatus } as MyTask);
        let detail = 'Failed to update status';
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          // body wasn't JSON — keep the generic message
        }
        toast.error(detail);
      } else {
        // Backend writes a "Moved to <Status>" auto-comment for every status
        // change. Bust the local cache and refetch so the panel surfaces it
        // without the user closing and reopening the ticket.
        commentCache.current.delete(task.id);
        fetchComments(true);
      }
    } catch {
      onTaskChanged({ ...task, status: previousStatus } as MyTask);
      toast.error('Failed to update status');
    }
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
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

  const insertMention = (developer: { id: number; name: string }) => {
    const lastAtIndex = newComment.lastIndexOf('@');
    const beforeMention = newComment.substring(0, lastAtIndex);
    setNewComment(`${beforeMention}@${developer.name} `);
    setShowMentions(false);
    setMentionFilter('');
  };

  const handleSubmitComment = async (commentType: Comment['comment_type'] = 'comment') => {
    if (!newComment.trim()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/comments/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          work_item_id: parseInt(task.id),
          content: newComment,
          author_id: currentUserId || 1,
          comment_type: commentType,
        }),
      });
      if (response.ok) {
        const newCommentData = await response.json();
        setComments((prev) => [newCommentData, ...prev]);
        commentCache.current.delete(task.id);
        setNewComment('');
        const messages: Record<Comment['comment_type'], string> = {
          blocker: 'Blocker reported!',
          business_review: 'Business Review comment added!',
          comment: 'Comment added!',
        };
        toast.success(messages[commentType]);
      }
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const renderCommentContent = (content: string, mentions: number[] = []) => {
    const devMap = new Map(allDevelopers.map((d) => [d.id, d.name]));
    let result = content;
    mentions.forEach((devId) => {
      const devName = devMap.get(devId);
      if (devName) {
        const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        result = result.replace(regex, `<<<MENTION_${devId}>>>`);
      }
    });
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls: string[] = [];
    result = result.replace(urlRegex, (match) => {
      urls.push(match);
      return `<<<URL_${urls.length - 1}>>>`;
    });
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

  // Reusable comments fetcher. `force=true` skips the local cache so callers
  // (status change, log-hours) can pull in the auto-comments the backend just
  // wrote — "Marked as done", "Reopened ticket", "Logged Xh".
  const fetchComments = useCallback(
    async (force = false) => {
      if (!token) return;
      if (!force) {
        const cached = commentCache.current.get(task.id);
        if (cached !== undefined) {
          setComments(cached);
          return;
        }
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/comments/workitem/${task.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setComments(data || []);
          commentCache.current.set(task.id, data || []);
        }
      } catch (error) {
        console.error('Failed to fetch comments:', error);
      }
    },
    [task.id, token],
  );

  // Fetch comments when task changes (cache hit short-circuits the network).
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Fetch all developers for @mentions
  useEffect(() => {
    if (!token) return;
    const fetchDevs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/developers/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setAllDevelopers(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch developers:', error);
      }
    };
    fetchDevs();
  }, [token]);

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const tc = TASK_TYPE_CONFIG[task.type] || TASK_TYPE_CONFIG.task;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50">
        {/* Panel Header */}
        <div className="flex items-start justify-between p-5 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#080808] flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium flex-shrink-0"
              style={{ backgroundColor: tc.bg, color: tc.color }}
            >
              <tc.icon className="w-4 h-4" />
              {tc.label}
            </div>
            <span className="text-xs font-mono text-[#E0B954] flex-shrink-0">{task.key}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white ml-3 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Description
                </label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
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
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
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
                    value={editForm.story_points || 0}
                    onChange={(e) =>
                      setEditForm({ ...editForm, story_points: parseInt(e.target.value) || 0 })
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
                    value={editForm.assigned_hours || 0}
                    onChange={(e) =>
                      setEditForm({ ...editForm, assigned_hours: parseInt(e.target.value) || 0 })
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
                    value={editForm.logged_hours || 0}
                    onChange={(e) =>
                      setEditForm({ ...editForm, logged_hours: parseInt(e.target.value) || 0 })
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
                    value={editForm.remaining_hours || 0}
                    onChange={(e) =>
                      setEditForm({ ...editForm, remaining_hours: parseInt(e.target.value) || 0 })
                    }
                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
                <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                  <PopoverTrigger asChild>
                    <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                      <Calendar className="w-4 h-4 mr-2" />
                      {editForm.due_date
                        ? parseLocalDate(editForm.due_date)?.toLocaleDateString('en-US', {
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
                        editForm.due_date === null ? undefined : editForm.due_date,
                      )}
                      onSelect={(date) => {
                        if (date) {
                          setEditForm({ ...editForm, due_date: formatLocalDate(date) });
                          setShowCalendar(false);
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      classNames={CALENDAR_CLASS_NAMES}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
                <select
                  value={editForm.assignee_id || ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      assignee_id: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {projectDevelopers.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name} ({dev.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={saveEdit}
                  className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl h-10 font-medium"
                >
                  Save Changes
                </Button>
                <Button
                  onClick={cancelEdit}
                  variant="outline"
                  className="flex-1 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#a3a3a3] hover:text-white rounded-xl h-10"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold text-white mb-3">{task.title}</h2>
                <p className="text-sm text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">
                  {renderTextWithNewlines(task.description || '') || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: 'Story Points',
                    value: String(task.story_points || 0),
                    color: '#E0B954',
                  },
                  {
                    label: 'Allocated Hours',
                    value: `${task.assigned_hours || 0}h`,
                    color: '#E0B954',
                  },
                  { label: 'Logged Hours', value: `${task.logged_hours || 0}h`, color: '#E0B954' },
                  {
                    label: 'Remaining Hours',
                    value: `${task.remaining_hours || 0}h`,
                    color: '#F59E0B',
                  },
                  {
                    label: 'Due Date',
                    value: task.due_date
                      ? new Date(task.due_date as string).toLocaleDateString()
                      : 'Not set',
                    color: task.due_date ? '#E0B954' : '#737373',
                  },
                  {
                    label: 'Status',
                    value: (
                      STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.todo
                    ).label,
                    color: (
                      STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.todo
                    ).color,
                  },
                  {
                    label: 'Priority',
                    value: task.priority?.charAt(0).toUpperCase() + (task.priority?.slice(1) || ''),
                    color:
                      task.priority === 'critical'
                        ? '#EF4444'
                        : task.priority === 'high'
                          ? '#F97316'
                          : task.priority === 'medium'
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

              <div className="space-y-3">
                {[
                  { label: 'Assignee', value: task.assignee || 'Unassigned' },
                  ...(task.reporter_name
                    ? [{ label: 'Created By', value: task.reporter_name }]
                    : []),
                  { label: 'Sprint', value: task.sprint || 'Not assigned' },
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

              {(task.epic_key || task.parent_key) && (
                <div>
                  <div className="text-xs text-[#737373] mb-2 font-medium">Hierarchy</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {task.epic_key && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(167,139,250,0.12)] text-[#A78BFA] text-xs">
                        Epic: {task.epic_key}
                      </span>
                    )}
                    {task.epic_key && task.parent_key && (
                      <span className="text-[#555] text-xs">›</span>
                    )}
                    {task.parent_key && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(224,185,84,0.10)] text-[#E0B954] text-xs">
                        Parent: {task.parent_key}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {task.tags && task.tags.length > 0 && (
                <div>
                  <div className="text-xs text-[#737373] mb-2 font-medium">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map((tag) => (
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

              <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#737373] mb-3 font-medium">Log Work Hours</div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    placeholder="Hours"
                    min="0"
                    max="24"
                    className="w-24 h-9 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                    id="log-hours-input"
                  />
                  <Button
                    size="sm"
                    disabled={isLoggingHours}
                    onClick={() => {
                      if (isLoggingHours) return;
                      const input = document.getElementById('log-hours-input') as HTMLInputElement;
                      const hours = parseInt(input?.value || '0');
                      if (hours > 0) {
                        handleLogHours(hours);
                        input.value = '';
                      }
                    }}
                    className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl h-9 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    {isLoggingHours ? 'Logging…' : 'Log Hours'}
                  </Button>
                </div>
                <p className="text-[10px] text-[#737373] mt-2">
                  Current: {task.logged_hours || 0}h logged · {task.remaining_hours || 0}h remaining
                </p>
              </div>

              <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#737373] mb-3 font-medium">Move to</div>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(
                    (status) => (
                      <Button
                        key={status}
                        size="sm"
                        onClick={() => handleStatusChange(status)}
                        className={`rounded-lg text-xs h-9 transition-all ${
                          task.status === status
                            ? 'text-white shadow-lg'
                            : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'
                        }`}
                        style={
                          task.status === status
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

              <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#737373] mb-3 font-medium">Activity & Comments</div>

                <div className="relative mb-4">
                  <Textarea
                    value={newComment}
                    onChange={handleCommentChange}
                    placeholder="Add a comment... Use @ to mention someone"
                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none pr-20"
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

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[rgba(255,255,255,0.05)] flex gap-3">
          <button
            onClick={() => startEdit()}
            disabled={task.status === 'done'}
            title={
              task.status === 'done' ? 'This ticket is done. Re-open it before editing.' : undefined
            }
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-white font-semibold text-sm hover:bg-[rgba(255,255,255,0.08)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[rgba(255,255,255,0.05)]"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => onOpenInProjectBoard(task.project_id, task.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-4 h-4" />
            Open ticket
          </button>
        </div>
      </div>
    </>
  );
};

export default TicketDetailPanel;
