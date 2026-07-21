import { useEffect, useRef } from 'react';
import { TimeBlock } from '../components/TimeBlock';
import { DRAFT_ID } from '../hooks/useCalendarDrag';
import {
  type GridConfig,
  type WeekDay,
  formatClock,
  formatDuration,
  gridHeight,
  hourToY,
} from '../lib/calendar';
import { CALENDAR } from '../lib/calendarTheme';
import { layoutDay } from '../lib/layout';
import type { CalendarBlock, PaletteTicket } from '../types';

/** Soft daily-capacity reference for the per-day header total coloring. */
const DAY_CAP_HOURS = 8;

interface WeekGridProps {
  cfg: GridConfig;
  days: WeekDay[];
  blocks: CalendarBlock[];
  /** Soft project filter: return true to render a block dimmed (still visible). */
  isDimmed?: (block: CalendarBlock) => boolean;
  draft: CalendarBlock | null;
  preview: CalendarBlock | null;
  selectedId: number | null;
  confirmDeleteId: number | null;
  ticketOptions: PaletteTicket[];
  nowDayIdx: number | null;
  nowDecimal: number | null;
  colsRef: React.RefObject<HTMLDivElement | null>;
  onColumnPointerDown: (dayIdx: number, e: React.PointerEvent) => void;
  onColumnDoubleClick: (dayIdx: number, e: React.MouseEvent) => void;
  onBlockPointerDown: (block: CalendarBlock, e: React.PointerEvent) => void;
  onBlockDoubleClick: (block: CalendarBlock) => void;
  onSelectBlock: (id: number) => void;
  onResizePointerDown: (
    block: CalendarBlock,
    edge: 'top' | 'bottom',
    e: React.PointerEvent,
  ) => void;
  onReassign: (block: CalendarBlock, workItemId: number) => void;
  onDuplicate: (block: CalendarBlock) => void;
  onRequestDelete: (id: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: number) => void;
}

export function WeekGrid({
  cfg,
  days,
  blocks,
  isDimmed,
  draft,
  preview,
  selectedId,
  confirmDeleteId,
  ticketOptions,
  nowDayIdx,
  nowDecimal,
  colsRef,
  onColumnPointerDown,
  onColumnDoubleClick,
  onBlockPointerDown,
  onBlockDoubleClick,
  onSelectBlock,
  onResizePointerDown,
  onReassign,
  onDuplicate,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: WeekGridProps) {
  const bodyH = gridHeight(cfg);
  const dayCount = days.length;
  const colPct = 100 / dayCount;

  // Auto-scroll once on mount to the current time (if this week contains today),
  // else to the start of the working-hours band — so the full-day grid doesn't
  // open parked at midnight.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didScroll = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (didScroll.current || !el) return;
    const target = nowDayIdx !== null && nowDecimal !== null ? nowDecimal : cfg.workStartHour;
    el.scrollTop = Math.max(0, hourToY(target, cfg) - cfg.hourPx * 1.5);
    didScroll.current = true;
  }, [cfg, nowDayIdx, nowDecimal]);

  // Apply the in-progress draft over the committed block it represents, and
  // surface a freshly-drawn block (DRAFT_ID) as an extra item.
  const effective = blocks.map((b) => (draft && draft.id === b.id ? draft : b));
  const drawingNew = draft && draft.id === DRAFT_ID ? draft : null;

  const hourRows = [];
  for (let h = cfg.startHour; h <= cfg.endHour; h++) hourRows.push(h);

  const subGrid = `repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 1px, transparent 1px ${cfg.hourPx / 4}px), repeating-linear-gradient(to bottom, rgba(255,255,255,0.075) 0 1px, transparent 1px ${cfg.hourPx}px)`;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* day header */}
      <div className="flex border-b border-white/[0.08] flex-none pr-2.5">
        <div className="w-14 flex-none" />
        {days.map((day) => {
          const total = effective
            .filter((b) => b.dayIdx === day.dayIdx)
            .reduce((s, b) => s + (b.end - b.start), 0);
          const over = total > DAY_CAP_HOURS + 1e-9;
          const warn = !over && total > DAY_CAP_HOURS * 0.875 + 1e-9;
          const isToday = day.dayIdx === nowDayIdx;
          const totalColor = over ? CALENDAR.over : warn ? CALENDAR.warn : CALENDAR.muted;
          return (
            <div
              key={day.dayIdx}
              className="flex-1 px-[11px] py-2 border-l border-white/[0.06] flex items-center justify-between"
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: isToday ? CALENDAR.accent : '#a3a3a3' }}
                >
                  {day.name}
                </span>
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: isToday ? CALENDAR.accent : '#f5f5f5' }}
                >
                  {day.date}
                </span>
              </div>
              <span
                className="text-[10px] tabular-nums"
                style={{ color: totalColor, fontWeight: over ? 700 : 400 }}
              >
                {total ? formatDuration(total) : '0h'}
              </span>
            </div>
          );
        })}
      </div>

      {/* scroll body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="flex">
          {/* hour gutter */}
          <div className="w-14 flex-none relative" style={{ height: bodyH }}>
            {hourRows.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-[#737373] tabular-nums"
                style={{ top: hourToY(h, cfg), transform: 'translateY(-7px)' }}
              >
                {formatClock(h)}
              </div>
            ))}
          </div>

          {/* day columns */}
          <div ref={colsRef} className="flex flex-1 min-w-0 relative" style={{ height: bodyH }}>
            {/* Off-hours shading: dim the time before/after working hours so the
                working band reads as primary while the rest stays usable. */}
            <div
              className="absolute left-0 right-0 top-0 z-0 pointer-events-none bg-black/25"
              style={{ height: hourToY(cfg.workStartHour, cfg) }}
              aria-hidden
            />
            <div
              className="absolute left-0 right-0 z-0 pointer-events-none bg-black/25"
              style={{ top: hourToY(cfg.workEndHour, cfg), bottom: 0 }}
              aria-hidden
            />
            {days.map((day) => {
              const dayItems = effective.filter((b) => b.dayIdx === day.dayIdx);
              if (drawingNew && drawingNew.dayIdx === day.dayIdx) dayItems.push(drawingNew);
              const positioned = layoutDay(dayItems);
              return (
                <div
                  key={day.dayIdx}
                  onPointerDown={(e) => onColumnPointerDown(day.dayIdx, e)}
                  onDoubleClick={(e) => onColumnDoubleClick(day.dayIdx, e)}
                  className="flex-1 min-w-0 relative border-l border-white/[0.06]"
                  style={{ height: bodyH, backgroundImage: subGrid, cursor: 'crosshair' }}
                >
                  {positioned.map(({ item, lane, lanes }) => (
                    <TimeBlock
                      key={item.id === DRAFT_ID ? 'draft' : item.id}
                      block={item}
                      cfg={cfg}
                      lane={lane}
                      lanes={lanes}
                      selected={selectedId === item.id && item.id !== DRAFT_ID}
                      active={draft?.id === item.id}
                      dimmed={item.id !== DRAFT_ID && (isDimmed?.(item) ?? false)}
                      popoverSide={day.dayIdx <= 2 ? 'right' : 'left'}
                      confirmingDelete={confirmDeleteId === item.id}
                      ticketOptions={ticketOptions}
                      onPointerDown={(e) => onBlockPointerDown(item, e)}
                      onOpenDetail={() => onBlockDoubleClick(item)}
                      onSelect={() => onSelectBlock(item.id)}
                      onResizePointerDown={(edge, e) => onResizePointerDown(item, edge, e)}
                      onReassign={(workItemId) => onReassign(item, workItemId)}
                      onDuplicate={() => onDuplicate(item)}
                      onRequestDelete={() => onRequestDelete(item.id)}
                      onCancelDelete={onCancelDelete}
                      onConfirmDelete={() => onConfirmDelete(item.id)}
                    />
                  ))}

                  {/* now line */}
                  {day.dayIdx === nowDayIdx &&
                    nowDecimal !== null &&
                    nowDecimal >= cfg.startHour &&
                    nowDecimal <= cfg.endHour && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-[#E0B954] z-[7] pointer-events-none"
                        style={{ top: hourToY(nowDecimal, cfg) }}
                        aria-hidden
                      >
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-[#E0B954]" />
                      </div>
                    )}
                </div>
              );
            })}

            {/* palette drag preview */}
            {preview && (
              <div
                className="absolute rounded-md border-2 border-dashed z-[60] pointer-events-none px-1.5 py-1"
                style={{
                  top: hourToY(preview.start, cfg),
                  height: hourToY(preview.end, cfg) - hourToY(preview.start, cfg),
                  left: `calc(${(preview.dayIdx * colPct).toFixed(3)}% + 2px)`,
                  width: `calc(${colPct.toFixed(3)}% - 4px)`,
                  background: 'rgba(224,185,84,0.15)',
                  borderColor: '#E0B954',
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] font-semibold text-[#E0B954]">
                    {preview.ticketKey}
                  </span>
                  <span className="text-[9px] text-white font-semibold">
                    {formatDuration(preview.end - preview.start)}
                  </span>
                </div>
                <div className="text-[10px] text-white mt-0.5">
                  {formatClock(preview.start)} – {formatClock(preview.end)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
