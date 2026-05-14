import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TicketContributors from '@/components/TicketContributors';
import {
  Clock,
  CheckCircle2,
  X,
  Save,
  Trash2,
  Pencil,
  BookOpen,
  ClipboardList,
  Bug,
  Target,
  AlertCircle,
  MessageSquare,
  ArrowRight,
  Inbox,
  Calendar,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

// Helper function to parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
const parseLocalDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

interface WorkItem {
  id: string;
  key: string;
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

interface Developer {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  role: string;
  responsibilities?: string;
}

interface Comment {
  id: number;
  work_item_id: number;
  author_id: number | null;
  author_name: string;
  content: string;
  mentions: number[];
  comment_type: string;
  created_at: string;
  updated_at: string;
}

interface ItemDetailDrawerProps {
  selectedItem: WorkItem;
  projectId: string;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  editForm: Partial<WorkItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
  isSavingEdit: boolean;
  handleSaveEdit: () => void;
  handleDeleteItem: (itemId: string) => void;
  handleLogHours: (item: WorkItem, hoursToLog: number) => void;
  handleStatusChange: (item: WorkItem, newStatus: string) => void;
  handleMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
  workItems: WorkItem[];
  sprints: Sprint[];
  allDevelopers: Array<{ id: number; name: string; email: string }>;
  projectDevelopers: Developer[] | undefined;
  token: string;
  onClose: () => void;
  onBackdropClick: () => void;
  navigateToItem: (itemId: string) => void;
}

const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#C79E3B', label: 'Epic', bg: 'rgba(199,158,59,0.15)' },
};

const STATUS_CONFIG = {
  backlog: { label: 'Backlog', color: '#737373', icon: Inbox },
  todo: { label: 'To Do', color: '#E0B954', icon: Clock },
  in_progress: {
    label: 'In Progress',
    color: '#F59E0B',
    icon: Clock,
  },
  in_review: {
    label: 'In Review',
    color: '#C79E3B',
    icon: AlertCircle,
  },
  done: { label: 'Done', color: '#E0B954', icon: CheckCircle2 },
} as const;

const PRIORITY_COLORS = {
  critical: { border: 'border-red-500/60', text: 'text-red-400', bg: 'bg-red-500/10' },
  high: { border: 'border-orange-500/60', text: 'text-orange-400', bg: 'bg-orange-500/10' },
  medium: { border: 'border-yellow-500/50', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  low: { border: 'border-emerald-500/50', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

export default function ItemDetailDrawer({
  selectedItem,
  projectId,
  isEditing,
  setIsEditing,
  editForm,
  setEditForm,
  isSavingEdit,
  handleSaveEdit,
  handleDeleteItem,
  handleLogHours,
  handleStatusChange,
  handleMoveToSprint,
  getNextSprint,
  workItems,
  sprints,
  allDevelopers,
  projectDevelopers,
  token,
  onClose,
  onBackdropClick,
  navigateToItem,
}: ItemDetailDrawerProps) {
  const queryClient = useQueryClient();

  // Drawer-local UI state
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);

  // Comments query — lazy: only fetches when a ticket is open
  const commentsQuery = useQuery<Comment[]>({
    queryKey: ['workItem', selectedItem.id, 'comments'],
    queryFn: () => apiFetch(`/api/comments/workitem/${selectedItem.id}`),
    enabled: !!selectedItem.id,
  });
  const comments = commentsQuery.data ?? [];

  // Submit comment mutation
  const submitCommentMutation = useMutation({
    mutationFn: (commentType: 'comment' | 'blocker' | 'business_review') =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(selectedItem.id),
          content: newComment,
          author_id: projectDevelopers?.[0]?.id || 1,
          comment_type: commentType,
        }),
      }),
    onSuccess: (_data, commentType) => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['workItem', selectedItem.id, 'comments'] });
      const messages = {
        blocker: 'Blocker reported!',
        business_review: 'Business Review comment added!',
        comment: 'Comment added!',
      } as const;
      toast.success(messages[commentType]);
    },
    onError: () => toast.error('Failed to add comment'),
  });

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

  const handleSubmitComment = (
    commentType: 'comment' | 'blocker' | 'business_review' = 'comment',
  ) => {
    if (!newComment.trim()) return;
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

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onBackdropClick}
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
              onClick={onClose}
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
                  {projectDevelopers?.map((dev) => (
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
                            href={`/project/${projectId}/board/${epicItem.id}`}
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
                            href={`/project/${projectId}/board/${parentItem.id}`}
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
                          onClick={() => navigateToItem(child.id)}
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
              <TicketContributors workItemId={selectedItem.id} token={token} />

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
                              href={`/project/${projectId}/board/${child.id}`}
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
  );
}
