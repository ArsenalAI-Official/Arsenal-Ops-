import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CreateWorkItemModal, type CreatedWorkItem } from '@/components/CreateWorkItemModal';
import { TicketDetailPanel } from '@/components/ProjectsPage';
import type { MyTask } from '@/components/ProjectsPage';
import { useAuth } from '@/contexts/AuthContext';
import { useAllDevelopers } from '@/hooks/useAllDevelopers';
import { apiFetch, ApiError } from '@/lib/api';
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
  placementInterval,
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

export interface WeekCalendarViewProps {
  /** 'page' fills the viewport (dedicated route); 'inline' is a bounded,
   *  embeddable height for the dashboard section. */
  layout?: 'page' | 'inline';
  /** When provided, a back affordance is shown (page placement only). */
  onNavigateBack?: () => void;
  /** Admin-only: whose calendar to show. Undefined = the caller's own. */
  employeeId?: number;
  /** Optional control rendered in the toolbar (e.g. an admin employee picker). */
  toolbarSlot?: React.ReactNode;
}

/**
 * The week-calendar engine. Rendered by both the dedicated `/week` page and the
 * inline dashboard section — the single source of the calendar's behavior, so
 * the two placements can never drift. Placement only changes chrome (height,
 * back button); all drag/log/sync logic lives here once.
 */
const WeekCalendarView = ({
  layout = 'page',
  onNavigateBack,
  employeeId,
  toolbarSlot,
}: WeekCalendarViewProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token, can } = useAuth();
  const isAdmin = can('admin.time_entries');
  // Whole-widget bounds, used to clear the active ticket / selection when the
  // user clicks outside the calendar.
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [activeTicket, setActiveTicket] = useState<PaletteTicket | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Admin employee picker: undefined = own calendar (editable); a dev id = view
  // that employee's calendar read-only. Seeded from the optional prop.
  const [viewingEmployeeId, setViewingEmployeeId] = useState<number | undefined>(employeeId);
  const [detailTask, setDetailTask] = useState<MyTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ dayIdx: number; start: number } | null>(null);
  // Per-project filter (own calendar only). null = all projects.
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  // Mon–Fri only. The QuickBooks sync window and the backend time-blocks query
  // are both Mon–Fri, so rendering weekend columns would show days the data
  // layer never returns; weekend logging is intentionally out of scope.
  const dayCount = DAY_COUNT;
  const readOnly = viewingEmployeeId != null; // viewing someone else's calendar

  const { data: developers = [] } = useAllDevelopers<{ id: number; name: string; email: string }>();
  const selfDevId = useMemo(
    () => developers.find((d) => d.email && d.email === user?.email)?.id ?? null,
    [developers, user?.email],
  );

  // Advance the "now" line / today highlight so a long-lived tab doesn't freeze
  // at mount time (and rolls over local midnight). new Date() lives in the
  // interval callback, not render, per react-hooks/purity.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { myTasks, myTasksLoading } = useMyTasks();
  const {
    blocks,
    unplaced,
    isLoading: blocksLoading,
    isError: blocksError,
    createBlock,
    updateBlock,
    placeBlock,
    deleteBlock,
  } = useWeekBlocks(weekStart, viewingEmployeeId);

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

  // --- per-project filter ---
  // Projects the user is assigned to, derived from their own tickets (so the
  // dropdown only ever lists projects relevant to this person). The work-item
  // key prefix ("SB" in "SB-12") maps 1:1 to a project and is the only project
  // signal a calendar block carries (blocks have no project_id), so it's how we
  // resolve a block's project for the grid dimming below.
  const { projectOptions, prefixToProjectId } = useMemo(() => {
    const names = new Map<number, string>();
    const prefixes = new Map<string, number>();
    for (const t of myTasks) {
      if (t.is_personal || t.project_id == null) continue;
      names.set(t.project_id, t.project_name ?? `Project ${t.project_id}`);
      const prefix = t.key.split('-')[0];
      if (prefix) prefixes.set(prefix, t.project_id);
    }
    const options = [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { projectOptions: options, prefixToProjectId: prefixes };
  }, [myTasks]);

  // Ignore a filter pointing at a project that's no longer assigned.
  const activeProjectFilter =
    projectFilter != null && projectOptions.some((p) => p.id === projectFilter)
      ? projectFilter
      : null;

  const projectIdForKey = useCallback(
    (key: string) => prefixToProjectId.get(key.split('-')[0] ?? '') ?? null,
    [prefixToProjectId],
  );

  // Sidebar palette: HARD filter — show only the selected project's tickets.
  const visibleTickets = useMemo(
    () =>
      activeProjectFilter == null
        ? tickets
        : tickets.filter((t) => projectIdForKey(t.key) === activeProjectFilter),
    [tickets, activeProjectFilter, projectIdForKey],
  );

  // Calendar: SOFT filter — blocks outside the selected project stay rendered
  // but dimmed. Never dims while an admin views someone else's calendar (the
  // filter is built from the viewer's own projects, not the viewed person's).
  const isKeyDimmed = useCallback(
    (key: string) =>
      !readOnly && activeProjectFilter != null && projectIdForKey(key) !== activeProjectFilter,
    [readOnly, activeProjectFilter, projectIdForKey],
  );

  const projectNameById = useMemo(
    () => new Map(projectOptions.map((p) => [p.id, p.name])),
    [projectOptions],
  );

  // This week's logged hours grouped by project (for the palette summary). Sums
  // the same positioned blocks as the week total, so the two always agree.
  const weekByProject = useMemo(() => {
    const acc = new Map<string, number>();
    for (const b of blocks) {
      const pid = projectIdForKey(b.work_item_key);
      const label =
        (pid != null ? projectNameById.get(pid) : undefined) ??
        b.work_item_key.split('-')[0] ??
        'Other';
      acc.set(label, (acc.get(label) ?? 0) + b.hours);
    }
    return [...acc.entries()]
      .map(([label, hours]) => ({ label, hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [blocks, projectIdForKey, projectNameById]);

  // Wire blocks → grid coords. Blocks outside the rendered Mon–Fri window drop
  // into the "unscheduled" tray rather than a fabricated slot.
  const { rendered, offWindow } = useMemo(() => {
    const renderedBlocks: CalendarBlock[] = [];
    const trayBlocks: typeof blocks = [];
    for (const b of blocks) {
      if (!b.start_time || !b.end_time) {
        trayBlocks.push(b);
        continue;
      }
      const { dayIdx, start, end } = intervalToBlock(weekStart, b.start_time, b.end_time);
      if (dayIdx < 0 || dayIdx >= dayCount) {
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
    return { rendered: renderedBlocks, offWindow: trayBlocks };
  }, [blocks, weekStart, dayCount]);

  // The tray = backend `unplaced` (ticket-logged, awaiting placement) plus any
  // positioned block that fell outside this week's columns.
  const tray = useMemo(() => [...unplaced, ...offWindow], [unplaced, offWindow]);

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
      // A tray entry being placed PATCHes its existing row; a palette ticket
      // creates a new block. Single source of truth: placing never adds a row.
      if (ticket.placingEntryId != null) {
        // Preserve the already-logged duration — placing only sets WHEN, not how
        // long. Override the 1h drop default with the entry's real hours.
        const dur = ticket.placingDurationHours ?? end - start;
        const placed = placementInterval(weekStart, dayIdx, start, dur, cfg);
        placeBlock({ id: ticket.placingEntryId, startISO: placed.startISO, endISO: placed.endISO });
      } else {
        createBlock({
          workItemId: ticket.workItemId,
          startISO,
          endISO,
          display: {
            key: ticket.key,
            title: ticket.title,
            type: ticket.type,
            status: ticket.status,
          },
        });
      }
    },
    [createBlock, placeBlock, weekStart],
  );

  const commitUpdate = useCallback(
    (id: number, dayIdx: number, start: number, end: number) => {
      if (id <= 0) return; // never move an uncommitted optimistic/draft row
      const { startISO, endISO } = blockToInterval(weekStart, dayIdx, start, end);
      updateBlock({ id, startISO, endISO });
    },
    [updateBlock, weekStart],
  );

  // Empty-grid double-click (no active ticket) → create a ticket at that slot.
  const handleEmptyDoubleClick = useCallback((dayIdx: number, start: number) => {
    setCreateSlot({ dayIdx, start });
    setCreateOpen(true);
  }, []);

  // Stable so useCalendarDrag's document listeners bind once, not per render.
  const dragCallbacks = useMemo(
    () => ({
      onCreate: commitCreate,
      onUpdate: commitUpdate,
      onEmptyDoubleClick: handleEmptyDoubleClick,
    }),
    [commitCreate, commitUpdate, handleEmptyDoubleClick],
  );
  const drag = useCalendarDrag({ cfg, dayCount, activeTicket, callbacks: dragCallbacks });

  // Flip a ticket's status from within the calendar (palette chip). Mirrors the
  // board/my-tasks mutation; invalidates the calendar too since block chips show
  // status color.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/workitems/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['timeBlocks'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to change status'),
  });

  // Open the existing full ticket panel (reused, not duplicated) for a work item.
  // Only opens when the ticket is in the caller's my-tasks feed. Shared by the
  // calendar block double-click and the palette chip double-click.
  const openTicketDetail = useCallback(
    (workItemId: number) => {
      const task = myTasks.find((t) => Number(t.id) === workItemId);
      if (task) setDetailTask(task);
    },
    [myTasks],
  );

  // Double-click a block → open that ticket's panel (matches the Jira board).
  const handleOpenDetail = useCallback(
    (block: CalendarBlock) => openTicketDetail(block.workItemId),
    [openTicketDetail],
  );

  // After creating a ticket from the calendar: if it landed on a drawn slot and
  // is assigned to the caller, drop a 1h block there so the gesture logs time
  // end-to-end. Otherwise it just appears in the palette (after invalidate).
  const handleCreated = useCallback(
    (item: CreatedWorkItem) => {
      const slot = createSlot;
      setCreateSlot(null);
      if (slot && item.assignee_id != null && item.assignee_id === selfDevId) {
        const end = Math.min(cfg.endHour, slot.start + 1);
        commitCreate(slot.dayIdx, slot.start, end, {
          workItemId: item.id,
          key: item.key,
          title: item.title,
          type: item.type,
          status: item.status,
          remainingHours: item.remaining_hours,
        });
      }
    },
    [createSlot, selfDevId, commitCreate],
  );

  // Keyboard: nudge/resize/move-day the selected block, Esc to deselect, Del to
  // confirm deletion. Disabled in read-only (admin viewing another calendar).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        drag.clearSelection();
        setConfirmDeleteId(null);
        setActiveTicket(null);
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
          Math.min(dayCount - 1, block.dayIdx + (e.key === 'ArrowRight' ? 1 : -1)),
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
  }, [drag, rendered, commitUpdate, readOnly, dayCount]);

  // Clicking off the calendar deselects the armed ticket and any selected block,
  // matching Escape. Pointerdown (not click) so it fires before a chip/block can
  // re-select; clicks inside the widget are ignored so drawing still works.
  const clearSelection = drag.clearSelection;
  useEffect(() => {
    if (readOnly) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setActiveTicket(null);
        clearSelection();
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [readOnly, clearSelection]);

  const handleChipPointerDown = (ticket: PaletteTicket, e: React.PointerEvent) => {
    if (readOnly) return;
    setConfirmDeleteId(null);
    // Don't arm the ticket here — a plain click toggles selection via onSelect
    // (so clicking an already-selected ticket deselects it). A drag captures the
    // ticket directly in the drag hook, so it doesn't need the active state.
    drag.onChipPointerDown(ticket, e);
  };

  const handleDuplicate = (block: CalendarBlock) => {
    const ticket = ticketByKey.get(block.ticketKey);
    if (!ticket) return;
    commitCreate(block.dayIdx, block.start, block.end, ticket);
  };

  const weekRangeLabel = useMemo(() => {
    const end = addDays(weekStart, dayCount - 1);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(weekStart)} – ${fmt(end)}, ${end.getFullYear()}`;
  }, [weekStart, dayCount]);

  const { nowDayIdx, nowDecimal } = useMemo(() => {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const idx = Math.round((midnight.getTime() - weekStart.getTime()) / 86_400_000);
    return {
      nowDayIdx: idx >= 0 && idx < dayCount ? idx : null,
      nowDecimal: now.getHours() + now.getMinutes() / 60,
    };
  }, [now, weekStart, dayCount]);

  // Per-project filter (own calendar only). Hidden when there's nothing to
  // choose between (≤1 project) or when viewing another person's calendar.
  const projectPicker =
    !readOnly && projectOptions.length > 1 ? (
      <select
        aria-label="Filter by project"
        value={activeProjectFilter ?? ''}
        onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
        className="h-[30px] bg-[#222] text-[#f5f5f5] border border-white/[0.12] rounded-md text-[11px] px-2"
      >
        <option value="">All projects</option>
        {projectOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    ) : null;

  // Admin-only employee picker (role-based visibility). Non-admins never see it
  // and are pinned to their own calendar by the backend regardless.
  const adminPicker = isAdmin ? (
    <select
      aria-label="View employee calendar"
      value={viewingEmployeeId ?? ''}
      onChange={(e) => {
        setViewingEmployeeId(e.target.value ? Number(e.target.value) : undefined);
        setDetailTask(null);
      }}
      className="h-[30px] bg-[#222] text-[#f5f5f5] border border-white/[0.12] rounded-md text-[11px] px-2"
    >
      <option value="">My calendar</option>
      {developers.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
          {d.id === selfDevId ? ' (me)' : ''}
        </option>
      ))}
    </select>
  ) : null;

  const rootClass =
    layout === 'page'
      ? 'h-screen flex flex-col bg-[#0b0b0b] text-[#f5f5f5] overflow-hidden select-none'
      : 'h-[640px] flex flex-col bg-[#0b0b0b] text-[#f5f5f5] overflow-hidden select-none rounded-xl border border-white/[0.08]';

  return (
    <div ref={rootRef} className={rootClass}>
      {onNavigateBack && (
        <div className="flex items-center gap-2 px-[18px] pt-3">
          <button
            type="button"
            onClick={onNavigateBack}
            className="flex items-center gap-1.5 text-[12px] text-[#737373] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Projects
          </button>
        </div>
      )}

      <CalendarToolbar
        weekRangeLabel={weekRangeLabel}
        weekTotalHours={weekTotalHours}
        cfg={cfg}
        onPrev={() => setWeekStart((w) => addDays(w, -7))}
        onToday={() => setWeekStart(startOfWeekMonday(new Date()))}
        onNext={() => setWeekStart((w) => addDays(w, 7))}
        slot={
          <>
            {projectPicker}
            {adminPicker ?? toolbarSlot}
          </>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Palette is the caller's own drag source; hide it when an admin is
            viewing someone else's calendar (read-only) — showing the viewer's
            own tickets there is confusing and they can't be dragged anyway. */}
        {!readOnly && (
          <TicketPalette
            tickets={visibleTickets}
            activeTicketId={activeTicket?.workItemId ?? null}
            scheduledByTicket={scheduledByTicket}
            weekByProject={weekByProject}
            weekTotalHours={weekTotalHours}
            readOnly={readOnly}
            onChipPointerDown={handleChipPointerDown}
            onSelectTicket={(t) =>
              setActiveTicket((cur) => (cur?.workItemId === t.workItemId ? null : t))
            }
            onOpenTicket={(t) => openTicketDetail(t.workItemId)}
            onChangeStatus={(t, status) => statusMutation.mutate({ id: t.workItemId, status })}
            onNewTicket={() => {
              setCreateSlot(null);
              setCreateOpen(true);
            }}
          />
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
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
            days={weekDays(weekStart, dayCount)}
            blocks={rendered}
            isDimmed={(b) => isKeyDimmed(b.ticketKey)}
            draft={drag.draft}
            preview={drag.preview}
            selectedId={drag.selectedId}
            confirmDeleteId={confirmDeleteId}
            ticketOptions={tickets}
            nowDayIdx={nowDayIdx}
            nowDecimal={nowDecimal}
            colsRef={drag.colsRef}
            onColumnPointerDown={(d, e) => {
              if (readOnly) return;
              setConfirmDeleteId(null);
              drag.onColumnPointerDown(d, e);
            }}
            onColumnDoubleClick={readOnly ? () => {} : drag.onColumnDoubleClick}
            onBlockPointerDown={(b, e) => {
              if (readOnly) return;
              setConfirmDeleteId(null);
              drag.onBlockPointerDown(b, e);
            }}
            onBlockDoubleClick={handleOpenDetail}
            onSelectBlock={drag.select}
            onResizePointerDown={drag.onResizePointerDown}
            onReassign={(b, workItemId) => {
              // Optimistic rows have negative ids and no server row yet — a
              // PATCH would 404. Skip until the create settles.
              if (b.id <= 0) return;
              const t = tickets.find((tk) => tk.workItemId === workItemId);
              updateBlock({
                id: b.id,
                workItemId,
                display: t
                  ? { key: t.key, title: t.title, type: t.type, status: t.status }
                  : undefined,
              });
            }}
            onDuplicate={handleDuplicate}
            onRequestDelete={setConfirmDeleteId}
            onCancelDelete={() => setConfirmDeleteId(null)}
            onConfirmDelete={(id) => {
              if (id > 0) deleteBlock(id); // negative id = unpersisted optimistic row
              setConfirmDeleteId(null);
              drag.clearSelection();
            }}
          />

          {tray.length > 0 && (
            <div className="flex-none border-t border-white/[0.08] px-[18px] py-2.5 max-h-28 overflow-y-auto">
              <div className="text-[11px] font-semibold text-[#a3a3a3] mb-1.5">
                To place ({tray.length}){' '}
                <span className="font-normal text-[#737373]">— drag onto the grid</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tray.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onPointerDown={(e) =>
                      handleChipPointerDown(
                        {
                          workItemId: b.work_item_id,
                          key: b.work_item_key,
                          title: b.work_item_title,
                          type: b.work_item_type,
                          status: b.work_item_status,
                          remainingHours: 0,
                          placingEntryId: b.id,
                          placingDurationHours: b.hours,
                        },
                        e,
                      )
                    }
                    style={{ opacity: isKeyDimmed(b.work_item_key) ? 0.4 : 1 }}
                    className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-[11px] cursor-grab hover:border-[#E0B954]/40"
                  >
                    <span className="font-mono text-[10px] font-semibold text-[#E0B954]">
                      {b.work_item_key}
                    </span>
                    <span className="text-[#a3a3a3]">{formatDuration(b.hours)}</span>
                  </button>
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

      {/* Double-click a block → the existing full ticket panel (reused). */}
      {detailTask && (
        <TicketDetailPanel
          task={detailTask}
          token={token}
          currentUserId={user?.id ?? null}
          onClose={() => setDetailTask(null)}
          onTaskChanged={(updated) => {
            setDetailTask(updated);
            queryClient.invalidateQueries({ queryKey: ['myTasks'] });
            queryClient.invalidateQueries({ queryKey: ['workItems'] });
            queryClient.invalidateQueries({ queryKey: ['timeBlocks'] });
          }}
          onOpenInProjectBoard={(projectId, taskId) => {
            navigate(`/project/${projectId}/board/${taskId}`);
            setDetailTask(null);
          }}
        />
      )}

      {/* Drag empty grid / palette "+ New" → minimal shared create-ticket modal. */}
      <CreateWorkItemModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateSlot(null);
        }}
        onCreated={handleCreated}
      />
    </div>
  );
};

export default WeekCalendarView;
