import {
  BookOpen,
  ClipboardList,
  Bug,
  Target,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import TimeEntriesTable from '@/components/TimeEntriesTable';

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

interface KanbanCardProps {
  item: WorkItem;
  columnColor: string;
  draggedItem: string | null;
  token: string;
  onDragStart: (itemId: string) => void;
  onMouseEnter: (itemId: string) => void;
  onClick: (itemId: string) => void;
}

const KanbanCard = ({
  item,
  columnColor,
  draggedItem,
  token,
  onDragStart,
  onMouseEnter,
  onClick,
}: KanbanCardProps) => {
  const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
  const TypeIcon = typeInfo.icon;
  const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
  const hoursProgress =
    item.assigned_hours > 0
      ? ((item.assigned_hours - item.remaining_hours) / item.assigned_hours) * 100
      : 0;

  return (
    <div
      key={item.id}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onMouseEnter={() => onMouseEnter(item.id)}
      onClick={() => onClick(item.id)}
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
        <span className="text-[10px] text-[#E0B954] font-mono font-medium">{item.key}</span>
      </div>

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
            <span className="text-[#E0B954]">{item.logged_hours || 0}h logged</span>
            <span>/ {item.assigned_hours}h</span>
          </span>
        </div>
        <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${hoursProgress}%`,
              background: `linear-gradient(90deg, ${columnColor}, ${columnColor}AA)`,
            }}
          />
        </div>
      </div>

      {/* Bottom: Points + Priority + Assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#E0B954]/15 flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#E0B954]">{item.story_points}</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-5 ${priorityStyle.border} ${priorityStyle.text}`}
          >
            {item.priority}
          </Badge>
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
            <span className="text-[9px] text-[#737373]">+{item.tags.length - 2}</span>
          )}
        </div>
      )}

      {/* This Week Time Entries Table */}
      <TimeEntriesTable workItemId={item.id} token={token} />
    </div>
  );
};

export default KanbanCard;
