import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GridConfig, snapHour, stepHours, yToHour } from '../lib/calendar';
import type { CalendarBlock, PaletteTicket } from '../types';

/** Sentinel id for the uncommitted block being drawn (real ids are positive,
 *  optimistic ids negative). */
export const DRAFT_ID = 0;

interface Grab {
  mode: 'draw' | 'move' | 'resizeTop' | 'resizeBottom' | 'palette';
  pointerId: number;
  downX: number;
  downY: number;
  started: boolean;
  // move/resize
  blockId?: number;
  anchor?: number; // draw anchor time
  offset?: number; // move grab offset within block
  dur?: number;
  origin?: CalendarBlock;
  ticket?: PaletteTicket; // palette/draw ticket
}

interface Ghost {
  x: number;
  y: number;
  ticket: PaletteTicket;
}

export interface CalendarDragCallbacks {
  onCreate: (dayIdx: number, start: number, end: number, ticket: PaletteTicket) => void;
  onUpdate: (id: number, dayIdx: number, start: number, end: number) => void;
  /** Double-click on empty grid with NO ticket selected — opens the "create a
   *  new ticket here" flow at the given slot. */
  onEmptyDoubleClick?: (dayIdx: number, start: number) => void;
}

export interface UseCalendarDragArgs {
  cfg: GridConfig;
  /** Column count (5 weekdays, or 7 with weekends) — drives x→day mapping. */
  dayCount: number;
  activeTicket: PaletteTicket | null;
  callbacks: CalendarDragCallbacks;
}

/**
 * Pointer-driven interaction model for the grid. Owns the column-area ref and a
 * transient "draft" block so a drag tracks instantly without touching the
 * server; commits via callbacks on pointer-up. Tracking uses pointermove/
 * pointerup listeners bound on `document` (one code path for mouse/touch/pen),
 * so a drag keeps following the pointer even when it leaves the originating
 * element or moves fast. `callbacks` must be referentially stable (the caller
 * memoizes it) so these listeners bind once rather than re-binding each render.
 */
export function useCalendarDrag({ cfg, dayCount, activeTicket, callbacks }: UseCalendarDragArgs) {
  const colsRef = useRef<HTMLDivElement | null>(null);
  const grab = useRef<Grab | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<CalendarBlock | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [preview, setPreview] = useState<CalendarBlock | null>(null);

  // Mirror preview/draft into refs so `finish` can read the committed geometry
  // WITHOUT calling onCreate/onUpdate inside a setState updater. React StrictMode
  // (dev) invokes updaters twice; running the mutation there fired it twice and
  // created duplicate overlapping blocks (and double-counted hours).
  const previewRef = useRef<CalendarBlock | null>(null);
  const draftRef = useRef<CalendarBlock | null>(null);
  const applyPreview = useCallback((v: CalendarBlock | null) => {
    previewRef.current = v;
    setPreview(v);
  }, []);
  const applyDraft = useCallback((v: CalendarBlock | null) => {
    draftRef.current = v;
    setDraft(v);
  }, []);

  const getPos = useCallback(
    (cx: number, cy: number) => {
      const el = colsRef.current;
      if (!el) return { inside: false, dayIdx: 0, time: cfg.startHour };
      const rect = el.getBoundingClientRect();
      // Guard a zero-width rect (display:none ancestor / mid-layout): colW=0 →
      // Math.floor(x/0) is Infinity/NaN, which would poison dayIdx.
      if (rect.width === 0) return { inside: false, dayIdx: 0, time: cfg.startHour };
      const colW = rect.width / dayCount;
      const x = cx - rect.left;
      const y = cy - rect.top;
      const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      const dayIdx = Math.max(0, Math.min(dayCount - 1, Math.floor(x / colW)));
      return { inside, dayIdx, time: yToHour(y, cfg) };
    },
    [cfg, dayCount],
  );

  const applyMove = useCallback(
    (cx: number, cy: number) => {
      const g = grab.current;
      if (!g) return;
      const step = stepHours(cfg);

      if (g.mode === 'palette' && g.ticket) {
        if (!g.started && Math.hypot(cx - g.downX, cy - g.downY) <= 4) return;
        g.started = true;
        setGhost({ x: cx, y: cy, ticket: g.ticket });
        const p = getPos(cx, cy);
        if (p.inside) {
          const start = snapHour(p.time, cfg);
          const end = Math.min(cfg.endHour, start + 1);
          applyPreview({
            id: DRAFT_ID,
            workItemId: g.ticket.workItemId,
            ticketKey: g.ticket.key,
            title: g.ticket.title,
            type: g.ticket.type,
            status: g.ticket.status,
            dayIdx: p.dayIdx,
            start,
            end,
          });
        } else {
          applyPreview(null);
        }
        return;
      }

      const p = getPos(cx, cy);
      if (g.mode === 'draw' && g.ticket && g.anchor !== undefined) {
        if (!g.started && Math.hypot(cx - g.downX, cy - g.downY) <= 3) return;
        g.started = true;
        const t = snapHour(p.inside ? p.time : g.anchor, cfg);
        let start = Math.min(g.anchor, t);
        let end = Math.max(g.anchor, t);
        if (end - start < step) end = Math.min(cfg.endHour, start + step);
        if (end - start < step) start = Math.max(cfg.startHour, end - step);
        applyDraft({
          id: DRAFT_ID,
          workItemId: g.ticket.workItemId,
          ticketKey: g.ticket.key,
          title: g.ticket.title,
          type: g.ticket.type,
          status: g.ticket.status,
          // A draw stays in the column it started in (origin.dayIdx), set on
          // pointer-down; it does not jump columns as the pointer moves.
          dayIdx: g.origin?.dayIdx ?? p.dayIdx,
          start,
          end,
        });
        return;
      }

      if (!g.origin) return;
      if (g.mode === 'move' && g.dur !== undefined && g.offset !== undefined) {
        if (!g.started && Math.hypot(cx - g.downX, cy - g.downY) <= 3) return;
        g.started = true;
        let start = snapHour(p.time - g.offset, cfg);
        start = Math.max(cfg.startHour, Math.min(start, cfg.endHour - g.dur));
        applyDraft({
          ...g.origin,
          dayIdx: p.inside ? p.dayIdx : g.origin.dayIdx,
          start,
          end: start + g.dur,
        });
      } else if (g.mode === 'resizeTop') {
        g.started = true;
        let start = snapHour(p.time, cfg);
        start = Math.max(cfg.startHour, Math.min(start, g.origin.end - step));
        applyDraft({ ...g.origin, start });
      } else if (g.mode === 'resizeBottom') {
        g.started = true;
        let end = snapHour(p.time, cfg);
        end = Math.min(cfg.endHour, Math.max(end, g.origin.start + step));
        applyDraft({ ...g.origin, end });
      }
    },
    [cfg, getPos, applyPreview, applyDraft],
  );

  const finish = useCallback(() => {
    const g = grab.current;
    grab.current = null;
    setGhost(null);
    if (!g) return;

    // Read committed geometry from refs and reset state, THEN fire the callback
    // exactly once. (Calling it inside a setState updater double-fires under
    // StrictMode → duplicate blocks.)
    if (g.mode === 'palette' && g.ticket) {
      const p = previewRef.current;
      applyPreview(null);
      if (p) callbacks.onCreate(p.dayIdx, p.start, p.end, g.ticket);
      return;
    }
    if (g.mode === 'draw') {
      const d = draftRef.current;
      applyDraft(null);
      if (d && g.started && g.ticket) callbacks.onCreate(d.dayIdx, d.start, d.end, g.ticket);
      return;
    }
    // move / resize
    const d = draftRef.current;
    applyDraft(null);
    if (d && g.started && g.origin) callbacks.onUpdate(d.id, d.dayIdx, d.start, d.end);
  }, [callbacks, applyPreview, applyDraft]);

  // Global pointer listeners — bound once. Events are gated to the pointer that
  // started the active grab so a second finger/pen can't hijack an in-flight
  // gesture, and `pointercancel` (touch interruption, OS gesture-takeover) aborts
  // the drag cleanly instead of leaving a frozen overlay + stuck grab.
  useEffect(() => {
    const forGrab = (e: PointerEvent) =>
      grab.current != null && e.pointerId === grab.current.pointerId;
    const move = (e: PointerEvent) => {
      if (forGrab(e)) applyMove(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (forGrab(e)) finish();
    };
    const cancel = (e: PointerEvent) => {
      if (!forGrab(e)) return;
      grab.current = null;
      applyPreview(null);
      applyDraft(null);
      setGhost(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [applyMove, finish, applyPreview, applyDraft]);

  // --- interaction starters (called from view components) ---
  const onColumnPointerDown = useCallback(
    (dayIdx: number, e: React.PointerEvent) => {
      if (grab.current) return; // a gesture is already in flight — ignore extra pointers
      if (!activeTicket) return; // need a ticket to draw against
      e.preventDefault();
      const p = getPos(e.clientX, e.clientY);
      grab.current = {
        mode: 'draw',
        pointerId: e.pointerId,
        downX: e.clientX,
        downY: e.clientY,
        started: false,
        anchor: snapHour(p.time, cfg),
        ticket: activeTicket,
        origin: { dayIdx } as CalendarBlock,
      };
      setSelectedId(null);
    },
    [activeTicket, cfg, getPos],
  );

  const onColumnDoubleClick = useCallback(
    (dayIdx: number, e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      grab.current = null;
      const p = getPos(e.clientX, e.clientY);
      let start = snapHour(p.time, cfg);
      start = Math.max(cfg.startHour, Math.min(start, cfg.endHour - 1));
      if (!activeTicket) {
        // No ticket selected → offer to create one at this slot.
        callbacks.onEmptyDoubleClick?.(dayIdx, start);
        return;
      }
      callbacks.onCreate(dayIdx, start, Math.min(cfg.endHour, start + 1), activeTicket);
    },
    [activeTicket, callbacks, cfg, getPos],
  );

  const onBlockPointerDown = useCallback(
    (block: CalendarBlock, e: React.PointerEvent) => {
      if (grab.current) return; // a gesture is already in flight — ignore extra pointers
      // Optimistic (negative id) and draft (DRAFT_ID) blocks have no server row
      // yet — dragging one would PATCH a non-existent id. Ignore until persisted.
      if (block.id <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      const p = getPos(e.clientX, e.clientY);
      grab.current = {
        mode: 'move',
        pointerId: e.pointerId,
        downX: e.clientX,
        downY: e.clientY,
        started: false,
        blockId: block.id,
        offset: p.time - block.start,
        dur: block.end - block.start,
        origin: block,
      };
      setSelectedId(block.id);
    },
    [getPos],
  );

  const onResizePointerDown = useCallback(
    (block: CalendarBlock, edge: 'top' | 'bottom', e: React.PointerEvent) => {
      if (grab.current) return; // a gesture is already in flight — ignore extra pointers
      if (block.id <= 0) return; // not yet persisted — see onBlockPointerDown
      e.preventDefault();
      e.stopPropagation();
      grab.current = {
        mode: edge === 'top' ? 'resizeTop' : 'resizeBottom',
        pointerId: e.pointerId,
        downX: e.clientX,
        downY: e.clientY,
        started: true,
        blockId: block.id,
        origin: block,
      };
      setSelectedId(block.id);
    },
    [],
  );

  const onChipPointerDown = useCallback((ticket: PaletteTicket, e: React.PointerEvent) => {
    if (grab.current) return; // a gesture is already in flight — ignore extra pointers
    e.preventDefault();
    grab.current = {
      mode: 'palette',
      pointerId: e.pointerId,
      downX: e.clientX,
      downY: e.clientY,
      started: false,
      ticket,
    };
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  // Memoized so the returned object's identity is stable across renders that
  // don't change drag state — consumers (e.g. the keydown effect) then don't
  // re-bind their listeners on every unrelated render.
  return useMemo(
    () => ({
      colsRef,
      selectedId,
      select: setSelectedId,
      clearSelection,
      draft,
      ghost,
      preview,
      onColumnPointerDown,
      onColumnDoubleClick,
      onBlockPointerDown,
      onResizePointerDown,
      onChipPointerDown,
    }),
    [
      selectedId,
      clearSelection,
      draft,
      ghost,
      preview,
      onColumnPointerDown,
      onColumnDoubleClick,
      onBlockPointerDown,
      onResizePointerDown,
      onChipPointerDown,
    ],
  );
}
