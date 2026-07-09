import React, { ComponentType, SVGProps } from 'react';
import { Badge } from '@/components/ui/badge';
import type { WorkItem } from '@/types/workItems';
import KanbanCard from './KanbanCard';

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
  // ── Done-column archive footer (only wired for status === 'done') ────────
  /** Archived done items not yet loaded; > 0 renders the "Show older" footer. */
  archiveRemaining?: number;
  /** True while an archive page is in flight — disables the footer button. */
  archiveLoading?: boolean;
  /** Loads the next archive page (useDoneArchive.loadOlder). */
  onLoadOlder?: () => void;
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
  archiveRemaining = 0,
  archiveLoading = false,
  onLoadOlder,
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
          ? 'border-brand/40 bg-brand/5 shadow-lg shadow-brand/10'
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

        {/* Empty state — suppressed when archived items exist, so the Done
            column shows the "Show older" footer instead of a lying "No items". */}
        {items.length === 0 && archiveRemaining === 0 && !archiveLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-2">
              <config.icon className="w-5 h-5 text-[#334155]" />
            </div>
            <p className="text-xs text-[#334155]">No items</p>
          </div>
        )}

        {/* Archive footer — done items completed >30 days ago are excluded
            from the board payload; this loads them a page at a time. */}
        {(archiveRemaining > 0 || archiveLoading) && (
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={archiveLoading}
            className="w-full py-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] text-xs font-medium text-[#737373] hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {archiveLoading
              ? 'Loading older items…'
              : `Show ${archiveRemaining} older item${archiveRemaining === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  );
};

// Custom equality: items must be a stable reference (parent precomputes via
// useMemo) — when items changes the column rerenders, otherwise we skip.
const areEqual = (prev: BoardColumnProps, next: BoardColumnProps) =>
  prev.status === next.status &&
  prev.items === next.items &&
  prev.workItems === next.workItems &&
  prev.isDropTarget === next.isDropTarget &&
  prev.draggedItem === next.draggedItem &&
  prev.token === next.token &&
  prev.config === next.config &&
  prev.archiveRemaining === next.archiveRemaining &&
  prev.archiveLoading === next.archiveLoading &&
  prev.onLoadOlder === next.onLoadOlder &&
  prev.onDragOver === next.onDragOver &&
  prev.onDragLeave === next.onDragLeave &&
  prev.onDrop === next.onDrop &&
  prev.onCardDragStart === next.onCardDragStart &&
  prev.onCardPrefetchComments === next.onCardPrefetchComments &&
  prev.onCardOpen === next.onCardOpen &&
  prev.onCardOpenByNumericId === next.onCardOpenByNumericId;

export default React.memo(BoardColumn, areEqual);
