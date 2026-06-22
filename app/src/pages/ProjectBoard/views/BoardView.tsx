import React from 'react';
import type { WorkItem } from '@/types/workItems';
import BoardColumn, { type BoardColumnStatusConfig } from '../components/BoardColumn';
import { BOARD_STATUS_ORDER } from '../lib/boardConstants';

export interface BoardViewProps {
  /** Per-status column buckets (memo-stable refs so BoardColumn React.memo holds). */
  columnItemsByStatus: Record<string, WorkItem[]>;
  /** Full work-item list — forwarded to each column/card unchanged. */
  workItems: WorkItem[];
  /** Status → column display config (label/color/icon). */
  statusConfig: Record<string, BoardColumnStatusConfig>;
  /** Auth token forwarded to cards (legacy child components). */
  token: string;
  // ── DnD bag (from useBoardDnd) ──────────────────────────────────────────
  draggedItem: string | null;
  dragOverColumn: string | null;
  onDragStart: (itemId: string) => void;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  // ── Card open / prefetch callbacks ──────────────────────────────────────
  onCardOpen: (itemId: string) => void;
  onCardOpenByNumericId: (numericId: number | null | undefined) => void;
  onPrefetchComments: (itemId: string) => void;
}

/**
 * Kanban board view body — extracted verbatim from ProjectBoard's
 * `viewMode === 'board'` block. Iterates BOARD_STATUS_ORDER (identical to the
 * former `Object.keys(STATUS_CONFIG)` order) and renders one BoardColumn per
 * status. Pure props-down: it owns no query/mutation/DnD state; everything is
 * injected by the orchestrator so the React.memo'd BoardColumn/KanbanCard keep
 * their stable references.
 */
const BoardView = ({
  columnItemsByStatus,
  workItems,
  statusConfig,
  token,
  draggedItem,
  dragOverColumn,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardOpen,
  onCardOpenByNumericId,
  onPrefetchComments,
}: BoardViewProps) => {
  return (
    <div
      role="tabpanel"
      id="tabpanel-board"
      aria-labelledby="tab-board"
      className="flex gap-4 p-6 min-h-[calc(100vh-140px)]"
    >
      {BOARD_STATUS_ORDER.map((status) => {
        const config = statusConfig[status];
        const columnItems = columnItemsByStatus[status] ?? [];
        const isDropTarget = dragOverColumn === status;

        return (
          <BoardColumn
            key={status}
            status={status}
            config={config}
            items={columnItems}
            workItems={workItems}
            isDropTarget={isDropTarget}
            draggedItem={draggedItem}
            token={token}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onCardDragStart={onDragStart}
            onCardPrefetchComments={onPrefetchComments}
            onCardOpen={onCardOpen}
            onCardOpenByNumericId={onCardOpenByNumericId}
          />
        );
      })}
    </div>
  );
};

export default BoardView;
