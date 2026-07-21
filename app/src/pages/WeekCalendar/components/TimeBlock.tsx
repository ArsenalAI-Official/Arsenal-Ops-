import { Copy, X } from 'lucide-react';
import { STATUS_CONFIG } from '@/lib/workItemConfig';
import { type GridConfig, formatClock, formatDuration, hourToY } from '../lib/calendar';
import type { CalendarBlock, PaletteTicket } from '../types';

const statusColor = (status: string): string =>
  STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.color ?? '#737373';

interface TimeBlockProps {
  block: CalendarBlock;
  cfg: GridConfig;
  lane: number;
  lanes: number;
  selected: boolean;
  /** True while this block is being dragged/resized — shows the live time label. */
  active: boolean;
  /** Project filter is active and this block isn't in it — render faded (still
   *  visible and interactive). */
  dimmed?: boolean;
  /** Side to anchor the toolbar/confirm popover so it doesn't clip off-screen. */
  popoverSide: 'left' | 'right';
  confirmingDelete: boolean;
  ticketOptions: PaletteTicket[];
  onPointerDown: (e: React.PointerEvent) => void;
  /** Keyboard select (Enter/Space) so the grid's arrow/Delete model is reachable. */
  onSelect: () => void;
  /** Double-click (or Enter on a selected block) opens the full ticket panel. */
  onOpenDetail: () => void;
  onResizePointerDown: (edge: 'top' | 'bottom', e: React.PointerEvent) => void;
  onReassign: (workItemId: number) => void;
  onDuplicate: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/** A single positioned calendar block: accent-colored body, key + duration, and
 *  (when selected) resize handles plus a toolbar for reassign/duplicate/delete. */
export function TimeBlock({
  block,
  cfg,
  lane,
  lanes,
  selected,
  active,
  dimmed = false,
  popoverSide,
  confirmingDelete,
  ticketOptions,
  onPointerDown,
  onSelect,
  onOpenDetail,
  onResizePointerDown,
  onReassign,
  onDuplicate,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: TimeBlockProps) {
  const accent = statusColor(block.status);
  const duration = block.end - block.start;
  const height = Math.max(16, hourToY(block.end, cfg) - hourToY(block.start, cfg));
  const widthPct = 100 / lanes;
  const showTitle = height >= 40;
  const popPos =
    popoverSide === 'right' ? { left: 'calc(100% + 6px)' } : { right: 'calc(100% + 6px)' };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${block.ticketKey} ${formatClock(block.start)} to ${formatClock(block.end)}. Enter opens the ticket; Space selects for keyboard move/resize.`}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation(); // don't trigger the column's create-on-double-click
        onOpenDetail();
      }}
      // Deliberate dual-action: Enter opens the full ticket (matches double-click),
      // Space selects the block so the grid's arrow-key move/resize model applies.
      // The aria-label above announces both so it isn't surprising.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenDetail();
        } else if (e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        position: 'absolute',
        top: hourToY(block.start, cfg),
        height,
        left: `calc(${(lane * widthPct).toFixed(3)}% + 2px)`,
        width: `calc(${widthPct.toFixed(3)}% - 4px)`,
        background: `${accent}26`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: '4px 7px',
        cursor: 'grab',
        zIndex: selected ? 20 : 2,
        outline: selected ? `2px solid ${accent}` : 'none',
        boxShadow: selected ? '0 6px 18px rgba(0,0,0,0.55)' : '0 1px 3px rgba(0,0,0,0.45)',
        overflow: 'visible',
        // Faded when outside the active project filter — but full strength once
        // selected so editing it stays legible.
        opacity: dimmed && !selected ? 0.3 : 1,
      }}
    >
      <div style={{ overflow: 'hidden', height: '100%' }}>
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="font-mono text-[10px] font-semibold" style={{ color: accent }}>
            {block.ticketKey}
          </span>
          <span className="text-[9px] text-[#a3a3a3] tabular-nums whitespace-nowrap">
            {formatDuration(duration)}
          </span>
        </div>
        {showTitle && (
          <div className="text-[11px] text-[#f5f5f5] leading-tight mt-0.5 overflow-hidden">
            {block.title}
          </div>
        )}
      </div>

      {active && (
        <div
          className="absolute -top-3 left-1.5 bg-[#E0B954] text-[#0b0b0b] text-[9px] font-bold px-1.5 py-px rounded whitespace-nowrap z-30"
          aria-hidden
        >
          {formatClock(block.start)} – {formatClock(block.end)}
        </div>
      )}

      {selected && !confirmingDelete && (
        <>
          <div
            onPointerDown={(e) => onResizePointerDown('top', e)}
            style={{
              position: 'absolute',
              top: -4,
              left: 0,
              right: 0,
              height: 9,
              cursor: 'ns-resize',
            }}
            className="flex justify-center items-start"
            aria-hidden
          >
            <div className="w-8 h-[5px] rounded-[3px]" style={{ background: accent }} />
          </div>
          <div
            onPointerDown={(e) => onResizePointerDown('bottom', e)}
            style={{
              position: 'absolute',
              bottom: -4,
              left: 0,
              right: 0,
              height: 9,
              cursor: 'ns-resize',
            }}
            className="flex justify-center items-end"
            aria-hidden
          >
            <div className="w-8 h-[5px] rounded-[3px]" style={{ background: accent }} />
          </div>

          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, ...popPos }}
            className="flex items-center gap-1 bg-[#161616] border border-white/12 rounded-lg p-1 shadow-xl z-40 whitespace-nowrap"
          >
            <select
              aria-label="Reassign block to ticket"
              // Keyed on the stable workItemId, not the display key, so reassign
              // is unambiguous even if two tickets ever share a key string.
              value={String(block.workItemId)}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onReassign(Number(e.target.value))}
              className="h-6 max-w-[140px] bg-[#222] text-[#f5f5f5] border border-white/12 rounded-md text-[11px] px-1.5 cursor-pointer"
            >
              {ticketOptions.map((t) => (
                <option key={t.workItemId} value={String(t.workItemId)}>
                  {t.key} · {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Duplicate"
              aria-label="Duplicate block"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDuplicate}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[#a3a3a3] hover:bg-white/10"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Delete"
              aria-label="Delete block"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRequestDelete}
              className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500/15 text-red-500 hover:bg-red-500/25"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </>
      )}

      {confirmingDelete && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 0, ...popPos, width: 190 }}
          className="bg-[#161616] border border-white/12 rounded-lg px-3 py-2.5 shadow-2xl z-50"
        >
          <div className="text-[11px] text-[#f5f5f5] font-semibold mb-0.5">Delete this block?</div>
          <div className="text-[10px] text-[#737373] leading-snug mb-2.5">
            {formatDuration(duration)} on {block.ticketKey}. This can&apos;t be undone.
          </div>
          <div className="flex gap-1.5 justify-end">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onCancelDelete}
              className="text-[10px] px-2.5 py-1 border border-white/12 rounded-md text-[#cbcbcb] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onConfirmDelete}
              className="text-[10px] px-2.5 py-1 rounded-md bg-red-500 text-white font-semibold hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
