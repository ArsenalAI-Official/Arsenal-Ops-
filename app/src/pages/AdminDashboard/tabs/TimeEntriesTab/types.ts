// Domain types + pure date/aggregation helpers for the Time Entries tab.
// Co-located so the orchestrator, filter bar, summary, and table all share one
// definition (CONVENTIONS rule 6). The helpers are pure (data in → data out)
// and called from `useMemo` bodies in the orchestrator.
import type { TimeEntryRow } from '@/client';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';

export interface ProjectOption {
  id: number;
  name: string;
}

export interface EmployeeOption {
  id: number;
  name: string;
  email: string;
}

// ── View modes ───────────────────────────────────────────────────────────────
// The tab can group hours by any of three dimensions. Employee is the default.
export type ViewMode = 'employee' | 'client' | 'project';

export const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'employee', label: 'By Employee' },
  { id: 'client', label: 'By Client' },
  { id: 'project', label: 'By Project' },
];

/**
 * Column headers per view. `primary` is the grouped dimension (the row label
 * beside the date). `childPrimary`/`childSecondary` are the columns a row
 * expands into:
 *   Employee → split by project (+ its client)
 *   Client   → split by employee
 *   Project  → split by employee
 */
export const VIEW_LABELS: Record<
  ViewMode,
  { primary: string; childPrimary: string; childSecondary: string | null }
> = {
  employee: { primary: 'Employee', childPrimary: 'Project', childSecondary: 'Client' },
  client: { primary: 'Client', childPrimary: 'Employee', childSecondary: null },
  project: { primary: 'Project', childPrimary: 'Employee', childSecondary: null },
};

/** Fallback labels for rows whose dimension value is missing. */
const MISSING = {
  employee: 'Deleted employee',
  client: 'No client',
  project: 'No project',
} as const;

/**
 * One line in a row's expandable breakdown (the child dimension) for that day:
 * e.g. under an employee-day, one project (with its client) they logged to.
 */
export interface GroupChildRow {
  key: string;
  label: string;
  /** Secondary context, e.g. the client a project bills to (employee view only). */
  sublabel: string | null;
  hours: number;
}

/**
 * A top-level table row: total hours one employee / client / project logged on
 * one local day. Expand `children` for the per-dimension split that sums back
 * to `hours`.
 */
export interface GroupRow {
  key: string;
  /** Local-time YYYY-MM-DD; drives the Date column and the descending sort. */
  dayKey: string;
  /** Latest raw timestamp in the bucket (kept for reference/tiebreak). */
  logged_at: string;
  label: string;
  sublabel: string | null;
  hours: number;
  children: GroupChildRow[];
}

interface Dim {
  id: string;
  label: string;
  sub: string | null;
}

function projectDim(r: TimeEntryRow, withClient: boolean): Dim {
  return {
    id: r.project_id != null ? `p${r.project_id}` : `pn:${r.project_name ?? ''}`,
    label: r.project_name ?? MISSING.project,
    sub: withClient ? (r.client_name ?? null) : null,
  };
}

function employeeDim(r: TimeEntryRow): Dim {
  return {
    id: r.developer_id != null ? `e${r.developer_id}` : `en:${r.developer_name ?? ''}`,
    label: r.developer_name ?? MISSING.employee,
    sub: null,
  };
}

function clientDim(r: TimeEntryRow): Dim {
  return {
    id: r.client_name ? `c:${r.client_name}` : 'c:none',
    label: r.client_name ?? MISSING.client,
    sub: null,
  };
}

function primaryDim(view: ViewMode, r: TimeEntryRow): Dim {
  if (view === 'employee') return employeeDim(r);
  if (view === 'client') return clientDim(r);
  return projectDim(r, true); // project view shows its client as sublabel
}

function childDim(view: ViewMode, r: TimeEntryRow): Dim {
  if (view === 'employee') return projectDim(r, true); // employee → project (+ client)
  return employeeDim(r); // client/project → employees
}

/**
 * Fold raw time-entry rows into one row per (local day, dimension) for the
 * given view, each carrying a per-child breakdown. Pure: called from a
 * `useMemo` in the orchestrator. Rows sort newest-day-first then hours-desc;
 * children sort hours-desc.
 */
export function aggregateEntries(
  rows: TimeEntryRow[],
  view: ViewMode,
): { groups: GroupRow[]; totalHours: number } {
  interface Acc extends GroupRow {
    _children: Map<string, GroupChildRow>;
  }
  const groups = new Map<string, Acc>();
  let totalHours = 0;

  for (const r of rows) {
    const hrs = r.hours || 0;
    const d = new Date(r.logged_at);
    if (Number.isNaN(d.getTime())) continue; // skip unparseable timestamps
    totalHours += hrs;

    const dayKey = formatLocalDate(d);
    const p = primaryDim(view, r);
    const gKey = `${dayKey}|${p.id}`;

    let g = groups.get(gKey);
    if (!g) {
      g = {
        key: gKey,
        dayKey,
        logged_at: r.logged_at,
        label: p.label,
        sublabel: p.sub,
        hours: 0,
        children: [],
        _children: new Map(),
      };
      groups.set(gKey, g);
    }
    g.hours += hrs;
    // Keep the latest raw timestamp in the bucket (cosmetic near a day boundary).
    if (d.getTime() > new Date(g.logged_at).getTime()) g.logged_at = r.logged_at;

    const c = childDim(view, r);
    let child = g._children.get(c.id);
    if (!child) {
      child = { key: `${gKey}>${c.id}`, label: c.label, sublabel: c.sub, hours: 0 };
      g._children.set(c.id, child);
    }
    child.hours += hrs;
  }

  const out: GroupRow[] = [];
  for (const g of groups.values()) {
    const children = [...g._children.values()].sort((a, b) => b.hours - a.hours);
    out.push({
      key: g.key,
      dayKey: g.dayKey,
      logged_at: g.logged_at,
      label: g.label,
      sublabel: g.sublabel,
      hours: g.hours,
      children,
    });
  }
  out.sort((a, b) => {
    // dayKey is YYYY-MM-DD, so lexicographic comparison orders dates correctly.
    if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? 1 : -1;
    return b.hours - a.hours || a.label.localeCompare(b.label);
  });
  return { groups: out, totalHours };
}

export type DatePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_week'
  | 'last_month'
  | 'custom';

export interface FiltersState {
  projectId: number | null;
  developerId: number | null;
  /** QuickBooks client name (null = all clients). */
  clientName: string | null;
  preset: DatePreset;
  // Only consulted when preset === 'custom'.
  customFrom: string;
  customTo: string;
}

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Start-of-week helper. The app's week runs **Saturday → Friday** — matches
 * `backend/services/capacity_service.py:week_boundaries()` and the
 * Employees tab capacity columns. Do not change without changing the
 * backend too, or the filtered range will disagree with the capacity view.
 *
 * JS Date.getDay() returns 0=Sun..6=Sat; we want days-since-most-recent-Sat:
 * Sat=0, Sun=1, Mon=2, … Fri=6 → `(getDay() + 1) % 7`.
 */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceSat = (out.getDay() + 1) % 7;
  out.setDate(out.getDate() - daysSinceSat);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Translate a filter preset to a concrete `from`/`to` ISO date pair the
 * backend understands. Both bounds are inclusive — the backend treats
 * `date_to` as end-of-day. Returns null bounds for "custom + empty input"
 * so the admin can leave one side open (e.g. all entries since a date).
 *
 * Today is read inside this helper — it's called from a `useMemo`, whose
 * body is opt-in non-pure (only runs when deps change), so the
 * react-hooks/purity rule is satisfied.
 */
export function resolveDateRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  if (preset === 'custom') {
    return {
      from: customFrom || null,
      to: customTo || null,
    };
  }
  const today = new Date();
  const todayStr = formatLocalDate(today);
  if (preset === 'today') {
    return { from: todayStr, to: todayStr };
  }
  if (preset === 'this_week') {
    return { from: formatLocalDate(startOfWeek(today)), to: todayStr };
  }
  if (preset === 'last_week') {
    const thisSat = startOfWeek(today);
    const lastSat = addDays(thisSat, -7);
    const lastFri = addDays(thisSat, -1);
    return { from: formatLocalDate(lastSat), to: formatLocalDate(lastFri) };
  }
  if (preset === 'this_month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatLocalDate(from), to: todayStr };
  }
  if (preset === 'last_month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    // Day 0 of the current month is the last day of the previous month.
    const to = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: formatLocalDate(from), to: formatLocalDate(to) };
  }
  return { from: null, to: null };
}

/**
 * Format a `YYYY-MM-DD` filter date as "Jun 8, 2026" for the Range summary
 * card. Uses `parseLocalDate` rather than `new Date(str)` because plain
 * `new Date("2026-06-08")` parses as UTC and shifts to the previous local
 * day in any timezone west of UTC — the same papercut `parseLocalDate`
 * exists to fix elsewhere in the app.
 */
export function formatRangeDate(yyyyMmDd: string): string {
  const d = parseLocalDate(yyyyMmDd);
  if (!d) return yyyyMmDd;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
