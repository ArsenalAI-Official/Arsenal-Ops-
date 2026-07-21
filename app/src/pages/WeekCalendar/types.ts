// Domain types for the WeekCalendar page. API request/response shapes come from
// the generated client (@/client); these are UI-only view models.
import type { TimeBlockResponse } from '@/client';

/** A positioned block as the grid renders it: decimal hours since local
 *  midnight, plus the weekday column it lands in. `id` is the TimeEntry id. */
export interface CalendarBlock {
  id: number;
  workItemId: number;
  ticketKey: string;
  title: string;
  type: string;
  status: string;
  dayIdx: number;
  start: number;
  end: number;
}

/** A ticket in the left palette — the drag source for new blocks. */
export interface PaletteTicket {
  workItemId: number;
  key: string;
  title: string;
  type: string;
  status: string;
  remainingHours: number;
  /** Set when this "ticket" is actually an unplaced tray entry being dragged
   *  onto the grid: drop PATCHes this existing TimeEntry's position instead of
   *  creating a new block (keeps single-source-of-truth — no new row). */
  placingEntryId?: number;
  /** The unplaced entry's already-logged hours. Placing must preserve this
   *  duration (a 2h logged entry stays 2h) rather than collapsing to the 1h
   *  drop default. */
  placingDurationHours?: number;
}

/** Wire block whose start_time fell outside the rendered Mon–Fri window, or a
 *  legacy entry with no position — surfaced in the "unscheduled" tray. */
export type UnscheduledEntry = TimeBlockResponse;

export type DragMode = 'draw' | 'move' | 'resizeTop' | 'resizeBottom' | 'palette';
