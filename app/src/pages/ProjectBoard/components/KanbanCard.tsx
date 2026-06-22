import React from 'react';
import { BookOpen, ClipboardList, Bug, Target, Clock, Ban } from 'lucide-react';
import TimeEntriesTable from '@/components/TimeEntriesTable';
import { EpicChip } from '@/components/board/EpicChip';
import { ParentChip } from '@/components/board/ParentChip';
import type { WorkItem } from '@/types/workItems';

interface StatusConfig {
  color: string;
}

const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: {
    icon: ClipboardList,
    color: '#FBBF24',
    label: 'Subtask',
    bg: 'rgba(251,191,36,0.15)',
  },
};

const PRIORITY_COLORS = {
  critical: { hex: '#EF4444' },
  high: { hex: '#F97316' },
  medium: { hex: '#F59E0B' },
  low: { hex: '#737373' },
};

export interface KanbanCardProps {
  item: WorkItem;
  workItems: WorkItem[];
  config: StatusConfig;
  draggedItem: string | null;
  token: string;
  onDragStart: (itemId: string) => void;
  onPrefetchComments: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onOpenByNumericId: (numericId: number | null | undefined) => void;
}

const KanbanCard = ({
  item,
  workItems,
  config,
  draggedItem,
  token,
  onDragStart,
  onPrefetchComments,
  onOpen,
  onOpenByNumericId,
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
      draggable
      onDragStart={() => onDragStart(item.id)}
      onMouseEnter={() => onPrefetchComments(item.id)}
      onClick={() => onOpen(item.id)}
      className={`group bg-[rgba(255,255,255,0.025)] rounded-xl border border-[rgba(255,255,255,0.05)] p-3.5 cursor-pointer transition-all duration-200 hover:border-[rgba(244,246,255,0.15)] hover:bg-[rgba(244,246,255,0.05)] hover:shadow-lg hover:shadow-black/20 ${
        draggedItem === item.id ? 'opacity-40 scale-95' : ''
      }`}
    >
      {/* Type + Key + Blocked badge */}
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
          style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
        >
          <TypeIcon className="w-3 h-3" />
          {typeInfo.label}
        </div>
        <span className="text-[10px] text-[#E0B954] font-mono font-medium">{item.key}</span>
        {/* Blocked badge — derived from `is_blocked` (server-computed:
            ticket has ≥1 unresolved blocker comment). Red so it pops at
            a glance on the kanban; the side panel's Unblock button is
            the cleanest way to clear it. */}
        {item.is_blocked && (
          <span
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]"
            title="This ticket has unresolved blocker comments"
          >
            <Ban className="w-2.5 h-2.5" />
            Blocked
          </span>
        )}
      </div>

      {/* Hierarchy chips */}
      {item.type !== 'epic' && (item.epic_key || item.parent_key) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap min-w-0">
          {item.epic_key && (
            <EpicChip
              epicKey={item.epic_key}
              epicTitle={workItems.find((wi) => wi.id === String(item.epic_id))?.title}
              onOpen={() => onOpenByNumericId(item.epic_id)}
            />
          )}
          {item.parent_key && (
            <ParentChip
              parentKey={item.parent_key}
              parentTitle={workItems.find((wi) => wi.id === String(item.parent_id))?.title}
              onOpen={() => onOpenByNumericId(item.parent_id)}
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
            <span className="text-[#E0B954]">{item.logged_hours || 0}h logged</span>
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
            <span className="text-[10px] font-bold text-[#E0B954]">{item.story_points}</span>
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
            <span className="text-[9px] text-[#737373]">+{item.tags.length - 2}</span>
          )}
        </div>
      )}

      {/* This Week Time Entries Table */}
      <TimeEntriesTable workItemId={item.id} token={token} />
    </div>
  );
};

// Custom equality: only re-render when fields that affect this card change.
// The parent's filteredItems memo means item identity changes only on data
// updates, so this is a defensive optimization for tag/hour/status tweaks.
const areEqual = (prev: KanbanCardProps, next: KanbanCardProps) => {
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.title === b.title &&
    a.story_points === b.story_points &&
    a.remaining_hours === b.remaining_hours &&
    a.logged_hours === b.logged_hours &&
    a.assigned_hours === b.assigned_hours &&
    a.assignee === b.assignee &&
    a.epic_key === b.epic_key &&
    a.parent_key === b.parent_key &&
    a.epic_id === b.epic_id &&
    a.parent_id === b.parent_id &&
    (a.tags?.length ?? 0) === (b.tags?.length ?? 0) &&
    prev.draggedItem === next.draggedItem &&
    prev.token === next.token &&
    prev.config?.color === next.config?.color &&
    prev.onDragStart === next.onDragStart &&
    prev.onPrefetchComments === next.onPrefetchComments &&
    prev.onOpen === next.onOpen &&
    prev.onOpenByNumericId === next.onOpenByNumericId &&
    // workItems is used for hierarchy chip title lookups. Reference equality
    // is sufficient — parent precomputes via useMemo so the array ref is
    // stable across renders.
    prev.workItems === next.workItems
  );
};

export default React.memo(KanbanCard, areEqual);
