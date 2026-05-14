import React from 'react';
import {
  Clock,
  CheckCircle2,
  Plus,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import KanbanCard from './KanbanCard';

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

interface BoardColumnProps {
  status: keyof typeof STATUS_CONFIG;
  columnItems: WorkItem[];
  dragOverColumn: string | null;
  draggedItem: string | null;
  token: string;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onCardDragStart: (itemId: string) => void;
  onCardMouseEnter: (itemId: string) => void;
  onCardClick: (itemId: string) => void;
}

const BoardColumn = ({
  status,
  columnItems,
  dragOverColumn,
  draggedItem,
  token,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardMouseEnter,
  onCardClick,
}: BoardColumnProps) => {
  const config = STATUS_CONFIG[status];
  const isDropTarget = dragOverColumn === status;

  return (
    <div
      className={`flex-1 min-w-[280px] max-w-[360px] flex flex-col rounded-2xl border transition-all duration-200 ${
        isDropTarget
          ? 'border-[#E0B954]/40 bg-[#E0B954]/5 shadow-lg shadow-[#E0B954]/10'
          : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
      }`}
      onDragOver={(e) => onDragOver(e, status)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, status)}
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
        {columnItems.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            columnColor={config.color}
            draggedItem={draggedItem}
            token={token}
            onDragStart={onCardDragStart}
            onMouseEnter={onCardMouseEnter}
            onClick={onCardClick}
          />
        ))}

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
};

export default BoardColumn;
