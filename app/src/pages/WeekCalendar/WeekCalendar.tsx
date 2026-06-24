import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyTasks } from '@/pages/ProjectsPage/hooks/useMyTasks';
import { useCalendarDrag } from './hooks/useCalendarDrag';
import { useWeekBlocks } from './hooks/useWeekBlocks';
import {
  DAY_COUNT,
  DEFAULT_GRID,
  addDays,
  blockToInterval,
  formatDuration,
  intervalToBlock,
  snapHour,
  startOfWeekMonday,
  stepHours,
  weekDays,
} from './lib/calendar';
import { CalendarToolbar } from './sections/CalendarToolbar';
import { TicketPalette } from './sections/TicketPalette';
import { WeekGrid } from './sections/WeekGrid';
import type { CalendarBlock, PaletteTicket } from './types';

const cfg = DEFAULT_GRID;

const WeekCalendar = () => {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [activeTicket, setActiveTicket] = useState<PaletteTicket | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Advance the "now" line / today highlight so a long-lived tab doesn't freeze
  // at the mount time (and rolls over local midnight). new Date() lives in the
  // interval callback, not render, per react-hooks/purity.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { myTasks, myTasksLoading } = useMyTasks();
  const {
    blocks,
    isLoading: blocksLoading,
    isError: blocksError,
    createBlock,
    updateBlock,
    deleteBlock,
  } = useWeekBlocks(weekStart);

  // Palette: the user's assigned work items (personal tasks excluded — you can't
  // log developer hours against them).
  const tickets = useMemo<PaletteTicket[]>(
    () =>
      myTasks
        .filter((t) => !t.is_personal && t.status !== 'done')
        .map((t) => ({
          workItemId: Number(t.id),
          key: t.key,
          title: t.title,
          type: t.type,
          status: t.status,
          remainingHours: t.remaining_hours ?? 0,
        })),
    [myTasks],
  );

  const ticketByKey = useMemo(() => new Map(tickets.map((t) => [t.key, t])), [tickets]);

  // Wire blocks → grid coords. Blocks outside the rendered Mon–Fri window (e.g.
  // weekend) drop into the "unscheduled" tray rather than a fabricated slot.
  const { rendered, unscheduled } = useMemo(() => {
    const renderedBlocks: CalendarBlock[] = [];
    const trayBlocks: typeof blocks = [];
    for (const b of blocks) {
      if (!b.start_time || !b.end_time) {
        trayBlocks.push(b);
        continue;
      }
      const { dayIdx, start, end } = intervalToBlock(weekStart, b.start_time, b.end_time);
      if (dayIdx < 0 || dayIdx >= DAY_COUNT) {
        trayBlocks.push(b);
        continue;
      }
      renderedBlocks.push({
        id: b.id,
        workItemId: b.work_item_id,
        ticketKey: b.work_item_key,
        title: b.work_item_title,
        type: b.work_item_type,
        status: b.work_item_status,
        dayIdx,
        start,
        end,
      });
    }
    return { rendered: renderedBlocks, unscheduled: trayBlocks };
  }, [blocks, weekStart]);

  const scheduledByTicket = useMemo(() => {
    const acc: Record<number, number> = {};
    for (const b of blocks) acc[b.work_item_id] = (acc[b.work_item_id] ?? 0) + b.hours;
    return acc;
  }, [blocks]);

  const weekTotalHours = useMemo(() => blocks.reduce((s, b) => s + b.hours, 0), [blocks]);

  // --- commit callbacks (UI coords → ISO interval) ---
  const commitCreate = useCallback(
    (dayIdx: number, start: number, end: number, ticket: PaletteTicket) => {
      const { startISO, endISO } = blockToInterval(weekStart, dayIdx, start, end);
      createBlock({
        workItemId: ticket.workItemId,
        startISO,
        endISO,
        display: { key: ticket.key, title: ticket.title, type: ticket.type, status: ticket.status },
      });
    },
    [createBlock, weekStart],
  );

  const commitUpdate = useCallback(
    (id: number, dayIdx: number, start: number, end: number) => {
      if (id <= 0) return; // never move an uncommitted optimistic/draft row
      const { startISO, endISO } = blockToInterval(weekStart, dayIdx, start, end);
      updateBlock({ id, startISO, endISO });
    },
    [updateBlock, weekStart],
  );

  // Stable so useCalendarDrag's document listeners bind once, not per render.
  const dragCallbacks = useMemo(
    () => ({ onCreate: commitCreate, onUpdate: commitUpdate }),
    [commitCreate, commitUpdate],
  );
  const drag = useCalendarDrag({ cfg, activeTicket, callbacks: dragCallbacks });

  // Keyboard: nudge/resize/move-day the selected block, Esc to deselect, Del to
  // confirm deletion. (Matches the on-screen hint in the toolbar.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        drag.clearSelection();
        setConfirmDeleteId(null);
        return;
      }
      const id = drag.selectedId;
      if (id === null || id <= 0) return;
      const block = rendered.find((b) => b.id === id);
      if (!block) return;
      const step = stepHours(cfg);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const nd = Math.max(
          0,
          Math.min(DAY_COUNT - 1, block.dayIdx + (e.key === 'ArrowRight' ? 1 : -1)),
        );
        commitUpdate(block.id, nd, block.start, block.end);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.shiftKey) {
          const end = snapHour(Math.max(block.start + step, block.end + dir * step), cfg);
          commitUpdate(block.id, block.dayIdx, block.start, end);
        } else {
          const dur = block.end - block.start;
          let start = snapHour(block.start + dir * step, cfg);
          start = Math.max(cfg.startHour, Math.min(start, cfg.endHour - dur));
          commitUpdate(block.id, block.dayIdx, start, start + dur);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && id > 0) {
        e.preventDefault();
        setConfirmDeleteId(id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drag, rendered, commitUpdate]);

  const handleChipPointerDown = (ticket: PaletteTicket, e: React.PointerEvent) => {
    setActiveTicket(ticket);
    setConfirmDeleteId(null);
    drag.onChipPointerDown(ticket, e);
  };

  const handleDuplicate = (block: CalendarBlock) => {
    const ticket = ticketByKey.get(block.ticketKey);
    if (!ticket) return;
    commitCreate(block.dayIdx, block.start, block.end, ticket);
  };

  const weekRangeLabel = useMemo(() => {
    const end = addDays(weekStart, DAY_COUNT - 1);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(weekStart)} – ${fmt(end)}, ${end.getFullYear()}`;
  }, [weekStart]);

  const { nowDayIdx, nowDecimal } = useMemo(() => {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const idx = Math.round((midnight.getTime() - weekStart.getTime()) / 86_400_000);
    return {
      nowDayIdx: idx >= 0 && idx < DAY_COUNT ? idx : null,
      nowDecimal: now.getHours() + now.getMinutes() / 60,
    };
  }, [now, weekStart]);

  return (
    <div className="h-screen flex flex-col bg-[#0b0b0b] text-[#f5f5f5] overflow-hidden select-none">
      <div className="flex items-center gap-2 px-[18px] pt-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-[12px] text-[#737373] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
      </div>

      <CalendarToolbar
        weekRangeLabel={weekRangeLabel}
        weekTotalHours={weekTotalHours}
        cfg={cfg}
        onPrev={() => setWeekStart((w) => addDays(w, -7))}
        onToday={() => setWeekStart(startOfWeekMonday(new Date()))}
        onNext={() => setWeekStart((w) => addDays(w, 7))}
      />

      <div className="flex flex-1 min-h-0">
        <TicketPalette
          tickets={tickets}
          activeTicketId={activeTicket?.workItemId ?? null}
          scheduledByTicket={scheduledByTicket}
          onChipPointerDown={handleChipPointerDown}
          onSelectTicket={setActiveTicket}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {blocksError && (
            <div
              role="alert"
              className="flex-none px-[18px] py-1.5 text-[11px] text-[#EF4444] bg-[#EF4444]/10 border-b border-[#EF4444]/20"
            >
              Couldn&apos;t load this week&apos;s time blocks. Try switching weeks or reloading.
            </div>
          )}
          {blocksLoading && !blocksError && (
            <div className="flex-none px-[18px] py-1.5 text-[11px] text-[#737373] border-b border-white/[0.06]">
              Loading time blocks…
            </div>
          )}
          <WeekGrid
            cfg={cfg}
            days={weekDays(weekStart)}
            blocks={rendered}
            draft={drag.draft}
            preview={drag.preview}
            selectedId={drag.selectedId}
            confirmDeleteId={confirmDeleteId}
            ticketOptions={tickets}
            nowDayIdx={nowDayIdx}
            nowDecimal={nowDecimal}
            colsRef={drag.colsRef}
            onColumnPointerDown={(d, e) => {
              setConfirmDeleteId(null);
              drag.onColumnPointerDown(d, e);
            }}
            onColumnDoubleClick={drag.onColumnDoubleClick}
            onBlockPointerDown={(b, e) => {
              setConfirmDeleteId(null);
              drag.onBlockPointerDown(b, e);
            }}
            onSelectBlock={drag.select}
            onResizePointerDown={drag.onResizePointerDown}
            onReassign={(b, workItemId) => updateBlock({ id: b.id, workItemId })}
            onDuplicate={handleDuplicate}
            onRequestDelete={setConfirmDeleteId}
            onCancelDelete={() => setConfirmDeleteId(null)}
            onConfirmDelete={(id) => {
              deleteBlock(id);
              setConfirmDeleteId(null);
              drag.clearSelection();
            }}
          />

          {unscheduled.length > 0 && (
            <div className="flex-none border-t border-white/[0.08] px-[18px] py-2.5 max-h-28 overflow-y-auto">
              <div className="text-[11px] font-semibold text-[#a3a3a3] mb-1.5">
                Unscheduled this week ({unscheduled.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-[10px] font-semibold text-[#E0B954]">
                      {b.work_item_key}
                    </span>
                    <span className="text-[#a3a3a3]">{formatDuration(b.hours)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* palette drag ghost */}
      {drag.ghost && (
        <div
          className="fixed z-[200] pointer-events-none w-[170px] bg-[#141414]/95 rounded-[9px] px-2.5 py-2 shadow-2xl"
          style={{
            left: drag.ghost.x,
            top: drag.ghost.y,
            transform: 'translate(10px, 8px) rotate(-3deg)',
            border: '1px solid #E0B954',
          }}
        >
          <div className="font-mono text-[10px] font-semibold text-[#E0B954] mb-1">
            {drag.ghost.ticket.key}
          </div>
          <div className="text-[11px] text-[#f5f5f5] leading-tight">{drag.ghost.ticket.title}</div>
        </div>
      )}

      {myTasksLoading && tickets.length === 0 && (
        <div className="absolute bottom-3 left-3 text-[11px] text-[#555]">Loading tickets…</div>
      )}
    </div>
  );
};

export default WeekCalendar;
