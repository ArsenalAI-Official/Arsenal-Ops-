import { ComponentType, SVGProps } from 'react';
import { Badge } from '@/components/ui/badge';
import KanbanCard from './KanbanCard';

interface WorkItem {
  id: string;
  key: string;
  type: 'user_story' | 'task' | 'bug' | 'epic';
  title: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  assigned_hours: number;
  remaining_hours: number;
  logged_hours: number;
  story_points: number;
  priority: 'high' | 'medium' | 'low' | 'critical';
  assignee: string;
  tags: string[];
  parent_id?: number | null;
  epic_id?: number | null;
  parent_key?: string | null;
  epic_key?: string | null;
}

export interface BoardColumnStatusConfig {
  label: string;
  color: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface BoardColumnProps {
  status: string;
  config: BoardColumnStatusConfig;
  items: WorkItem[];
  workItems: WorkItem[];
  isDropTarget: boolean;
  draggedItem: string | null;
  token: string;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onCardDragStart: (itemId: string) => void;
  onCardPrefetchComments: (itemId: string) => void;
  onCardOpen: (itemId: string) => void;
  onCardOpenByNumericId: (numericId: number | null | undefined) => void;
}

const BoardColumn = ({
  status,
  config,
  items,
  workItems,
  isDropTarget,
  draggedItem,
  token,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardPrefetchComments,
  onCardOpen,
  onCardOpenByNumericId,
}: BoardColumnProps) => {
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
          {items.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            workItems={workItems}
            config={config}
            draggedItem={draggedItem}
            token={token}
            onDragStart={onCardDragStart}
            onPrefetchComments={onCardPrefetchComments}
            onOpen={onCardOpen}
            onOpenByNumericId={onCardOpenByNumericId}
          />
        ))}

        {/* Empty state */}
        {items.length === 0 && (
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
