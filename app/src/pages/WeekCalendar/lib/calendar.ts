// Pure geometry + time helpers for the week calendar. No React, no I/O — unit
// tested in calendar.test.ts. The UI models a block as { dayIdx, start, end }
// where start/end are decimal hours since LOCAL midnight (e.g. 9.5 = 9:30am);
// the wire format is absolute UTC ISO timestamps. The block<->interval helpers
// are the single conversion boundary between the two.

export interface GridConfig {
  /** First hour row shown (0 = midnight). The grid spans the whole day and
   *  scrolls; the working-hours band below is only a visual emphasis. */
  startHour: number;
  /** Exclusive end of the grid (24 = next midnight). */
  endHour: number;
  /** Start of the emphasized "working hours" band — un-shaded, scrolled-to on
   *  load. Outside it the grid is dimmed but fully usable. */
  workStartHour: number;
  /** End of the working-hours band. */
  workEndHour: number;
  /** Pixel height of one hour row. */
  hourPx: number;
  /** Snap granularity in minutes. Whole-hour (60) for now; sub-hour (15/30) is a
   *  stacked follow-up (feat/week-calendar-minutes) pending app-wide review. */
  stepMinutes: number;
}

export const DEFAULT_GRID: GridConfig = {
  startHour: 0,
  endHour: 24,
  workStartHour: 7,
  workEndHour: 19,
  hourPx: 52,
  stepMinutes: 60,
};

/** Default number of weekday columns (Mon–Fri); 7 when weekends are shown. */
export const DAY_COUNT = 5;
/** Column count with weekends visible. */
export const FULL_WEEK_DAY_COUNT = 7;

export const stepHours = (cfg: GridConfig): number => cfg.stepMinutes / 60;

/** Round a decimal hour to the snap grid and clamp to the visible window. */
export function snapHour(t: number, cfg: GridConfig): number {
  const step = stepHours(cfg);
  const snapped = Math.round(t / step) * step;
  return Math.max(cfg.startHour, Math.min(cfg.endHour, snapped));
}

export const hourToY = (t: number, cfg: GridConfig): number => (t - cfg.startHour) * cfg.hourPx;

export const yToHour = (y: number, cfg: GridConfig): number => cfg.startHour + y / cfg.hourPx;

export const gridHeight = (cfg: GridConfig): number => (cfg.endHour - cfg.startHour) * cfg.hourPx;

/** "1h 30m" / "45m" / "2h". Input is decimal hours. */
export function formatDuration(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "3.5h" with trailing-zero trimming ("3h", not "3.0h"). */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}

/** Decimal hour → "9:30 AM" / "1 PM". */
export function formatClock(t: number): string {
  let h = Math.floor(t + 1e-9);
  let m = Math.round((t - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  const period = h < 12 || h === 24 ? 'AM' : 'PM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return m ? `${hh}:${String(m).padStart(2, '0')} ${period}` : `${hh} ${period}`;
}

// --- week / date helpers -------------------------------------------------

/** Local Monday 00:00 of the week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. Shift back to Monday.
  const dow = out.getDay();
  const backToMonday = (dow + 6) % 7;
  out.setDate(out.getDate() - backToMonday);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export interface WeekDay {
  dayIdx: number;
  /** "Mon" */
  name: string;
  /** Day-of-month, e.g. "16". */
  date: string;
  /** Whole local Date at midnight for this column. */
  full: Date;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekDays(weekStart: Date, dayCount: number = DAY_COUNT): WeekDay[] {
  return Array.from({ length: dayCount }, (_unused, dayIdx) => {
    const full = addDays(weekStart, dayIdx);
    return {
      dayIdx,
      name: DAY_NAMES[dayIdx] ?? '',
      date: String(full.getDate()),
      full,
    };
  });
}

// --- block <-> absolute-interval conversion ------------------------------

/** UI block position → ISO interval for the API, using a **wall-clock-as-UTC**
 *  convention: the drawn day+time is serialized as the same clock time in UTC
 *  (Mon 9am → ``...T09:00:00Z``) regardless of the viewer's timezone. The backend
 *  stores these naive-UTC and bills a positioned block on ``start_time.date()``,
 *  so anchoring to UTC here keeps the billing/grouping day equal to the day the
 *  block sits on. (A local-offset Date via ``setHours`` would push a late-evening
 *  block onto the next calendar day — and out of the Mon–Fri window at week
 *  edges — for any non-UTC user. See `weekStartToISO`, which anchors the request
 *  window the same way.) The calendar is timezone-independent by design: a block
 *  is "Monday 9am", not an absolute instant. */
export function blockToInterval(
  weekStart: Date,
  dayIdx: number,
  start: number,
  end: number,
): { startISO: string; endISO: string } {
  const base = addDays(weekStart, dayIdx);
  const mk = (decimal: number): string => {
    const h = Math.floor(decimal);
    const m = Math.round((decimal - h) * 60);
    const d = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0));
    return d.toISOString();
  };
  return { startISO: mk(start), endISO: mk(end) };
}

/** The request window's start, serialized to match `blockToInterval`'s
 *  wall-clock-as-UTC convention: the UTC instant at the Monday's calendar
 *  midnight. Keeps the backend's ``[week_start, week_start + 5d)`` window aligned
 *  with the stored block days for every viewer timezone (otherwise a
 *  ``weekStart.toISOString()`` from a non-UTC user shifts the window and drops
 *  Friday-afternoon blocks). */
export function weekStartToISO(weekStart: Date): string {
  return new Date(
    Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0),
  ).toISOString();
}

/** Interval for PLACING an unplaced (already-logged) tray entry onto the grid.
 *  Placing only sets WHEN — the entry keeps its full logged `durationHours`. If
 *  it wouldn't fit before the end of the day at this start, shift the start
 *  earlier rather than truncating the hours (which would silently lose logged
 *  time). The backend also preserves hours on placement as a backstop. */
export function placementInterval(
  weekStart: Date,
  dayIdx: number,
  start: number,
  durationHours: number,
  cfg: GridConfig,
): { startISO: string; endISO: string } {
  const maxStart = Math.max(cfg.startHour, cfg.endHour - durationHours);
  const clampedStart = Math.min(start, maxStart);
  const end = clampedStart + durationHours;
  return blockToInterval(weekStart, dayIdx, clampedStart, end);
}

/** ISO timestamps → UI block coords relative to `weekStart`, inverting
 *  `blockToInterval` (reads the wall-clock via UTC accessors). `dayIdx` may fall
 *  outside 0..4 when the block isn't in the rendered week. */
export function intervalToBlock(
  weekStart: Date,
  startISO: string,
  endISO: string,
): { dayIdx: number; start: number; end: number } {
  const startDate = new Date(startISO);
  const endDate = new Date(endISO);
  // Pure calendar-day arithmetic (both sides via Date.UTC of the day components)
  // — no tz/DST skew. weekStart is a local Monday-midnight Date; its calendar
  // date is the intended Monday.
  const startDay = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const endDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const weekStartDay = Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const dayIdx = Math.round((startDay - weekStartDay) / 86_400_000);
  const toDecimal = (d: Date): number => d.getUTCHours() + d.getUTCMinutes() / 60;
  const start = toDecimal(startDate);
  // Offset the end by however many whole days it lands after the start, so a
  // block ending at midnight (next-day 00:00Z) reads as 24:00 and a block that
  // spans past midnight keeps a positive height — without inflating a genuinely
  // zero-length interval (same instant → +0 days → unchanged).
  const endDayOffset = Math.round((endDay - startDay) / 86_400_000);
  const end = toDecimal(endDate) + endDayOffset * 24;
  return { dayIdx, start, end };
}
