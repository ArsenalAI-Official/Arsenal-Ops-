import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, AlertTriangle, X, Filter, Calendar } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { CALENDAR_CLASS_NAMES } from '@/components/ProjectsPage/constants';

/**
 * Admin Time Entries tab — workforce-tool-style filterable grid of every
 * TimeEntry across all projects. Mirrors the layout of Toggl/Harvest:
 * compact filter bar on top, totals strip, then a flat sortable table.
 *
 * Three filters compose with AND:
 *   - Date range (preset chips: Today / This week / This month / Last week / Last month / Custom)
 *   - Project (single-select from the admin projects list)
 *   - Employee (single-select from the admin employees list)
 *
 * "Custom" reveals a pair of calendar popovers backed by the same shadcn
 * Calendar component the Personal Tasks due-date picker uses, so the
 * keyboard navigation and visual styling stay consistent across the app.
 *
 * Backend: GET /api/admin/time-entries (capability admin.time_entries).
 */

interface ProjectOption {
  id: number;
  name: string;
}

interface EmployeeOption {
  id: number;
  name: string;
  email: string;
}

interface TimeEntriesTabProps {
  projects: ProjectOption[];
  employees: EmployeeOption[];
}

interface TimeEntryRow {
  id: number;
  hours: number;
  description: string | null;
  logged_at: string;
  work_item_id: number | null;
  work_item_key: string | null;
  work_item_title: string | null;
  work_item_type: string | null;
  project_id: number | null;
  project_name: string | null;
  developer_id: number | null;
  developer_name: string | null;
  developer_email: string | null;
  avatar_url: string | null;
}

interface TimeEntriesResponse {
  rows: TimeEntryRow[];
  total_hours: number;
  total_rows: number;
  truncated: boolean;
}

type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_week' | 'last_month' | 'custom';

/** Table layout — flat list, grouped by Sat→Fri week, or grouped by month. */
type GroupBy = 'none' | 'week' | 'month';

/** A group bucket — shared shape for week + month grouping so the render
 *  branch can treat them identically. `key` is a stable YYYY-MM-DD string
 *  used for React keys and Map lookups; `label` is the already-formatted
 *  header text ("Jun 6 → Jun 12, 2026" for week, "June 2026" for month).
 */
interface EntryGroup {
  key: string;
  label: string;
  totalHours: number;
  entries: TimeEntryRow[];
  sortDate: Date;
}

interface FiltersState {
  projectId: number | null;
  developerId: number | null;
  preset: DatePreset;
  // Only consulted when preset === 'custom'.
  customFrom: string;
  customTo: string;
  groupBy: GroupBy;
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
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
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceSat = (out.getDay() + 1) % 7;
  out.setDate(out.getDate() - daysSinceSat);
  return out;
}

function addDays(d: Date, n: number): Date {
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
function resolveDateRange(
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
 * Format an ISO timestamp as "Jun 8, 2026" for table display — date only,
 * no time component. Falls back to the raw string on parse error so an
 * upstream data issue doesn't render as "Invalid Date".
 */
function formatLoggedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a `YYYY-MM-DD` filter date as "Jun 8, 2026" for the Range summary
 * card. Uses `parseLocalDate` rather than `new Date(str)` because plain
 * `new Date("2026-06-08")` parses as UTC and shifts to the previous local
 * day in any timezone west of UTC — the same papercut `parseLocalDate`
 * exists to fix elsewhere in the app.
 */
function formatRangeDate(yyyyMmDd: string): string {
  const d = parseLocalDate(yyyyMmDd);
  if (!d) return yyyyMmDd;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * One row in the entries table. Extracted so the flat-list branch and the
 * "Group by week" branch share the same cell markup — otherwise the same
 * four `<td>`s lived in two places and could silently drift apart.
 */
const EntryRow: React.FC<{ row: TimeEntryRow }> = ({ row }) => (
  <tr className="hover:bg-[rgba(255,255,255,0.025)]">
    <td className="px-4 py-3 text-[#a3a3a3] whitespace-nowrap">{formatLoggedAt(row.logged_at)}</td>
    <td className="px-4 py-3 text-white">
      {row.developer_name ?? <span className="text-[#737373] italic">deleted</span>}
    </td>
    <td className="px-4 py-3 text-[#F4F6FF]">
      {row.project_name ?? <span className="text-[#737373] italic">—</span>}
    </td>
    <td className="px-4 py-3 text-right font-semibold text-white">{row.hours}h</td>
  </tr>
);

/**
 * From / To calendar pair, modeled on the Personal Tasks due-date popover
 * so the keyboard / pointer behaviour stays uniform across the app.
 *
 * - From is bounded by To (can't pick a date after To).
 * - To is bounded by From (can't pick a date before From).
 * - The "From" input is empty by default — both dates default to unset so
 *   the admin can open a one-sided range (e.g. everything since June 1st).
 * - A "Clear" button on each picker resets that side without closing the
 *   popover, since clearing both is a common audit-export flow.
 */
const CustomDateRangePicker: React.FC<{
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}> = ({ from, to, onFromChange, onToChange }) => {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);

  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div>
        <label className="text-[11px] text-[#737373] block mb-1">From</label>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#F4F6FF] justify-start text-left font-normal text-xs hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
            >
              {fromDate ? fromDate.toLocaleDateString() : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
          >
            <CalendarIcon
              mode="single"
              selected={fromDate}
              onSelect={(date) => {
                if (date) {
                  onFromChange(formatLocalDate(date));
                  setFromOpen(false);
                }
              }}
              // Block dates after `to` if To is already set, so the range
              // can never invert.
              disabled={toDate ? (date) => date > toDate : undefined}
              classNames={CALENDAR_CLASS_NAMES}
            />
            {from && (
              <button
                type="button"
                onClick={() => {
                  onFromChange('');
                  setFromOpen(false);
                }}
                className="mt-2 w-full text-[11px] text-[#737373] hover:text-white py-1 rounded"
              >
                Clear
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className="text-[11px] text-[#737373] block mb-1">To</label>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#F4F6FF] justify-start text-left font-normal text-xs hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
            >
              {toDate ? toDate.toLocaleDateString() : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
          >
            <CalendarIcon
              mode="single"
              selected={toDate}
              onSelect={(date) => {
                if (date) {
                  onToChange(formatLocalDate(date));
                  setToOpen(false);
                }
              }}
              disabled={fromDate ? (date) => date < fromDate : undefined}
              classNames={CALENDAR_CLASS_NAMES}
            />
            {to && (
              <button
                type="button"
                onClick={() => {
                  onToChange('');
                  setToOpen(false);
                }}
                className="mt-2 w-full text-[11px] text-[#737373] hover:text-white py-1 rounded"
              >
                Clear
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

const TimeEntriesTab: React.FC<TimeEntriesTabProps> = ({ projects, employees }) => {
  const [filters, setFilters] = useState<FiltersState>({
    projectId: null,
    developerId: null,
    preset: 'this_week',
    customFrom: '',
    customTo: '',
    groupBy: 'none',
  });

  // Sorted project + employee lists (alphabetical, locale-aware). Recomputed
  // only when the source arrays change — admin tabs share these queries with
  // sibling tabs so the references are already stable.
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [projects],
  );
  const sortedEmployees = useMemo(
    () =>
      [...employees].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [employees],
  );

  // Resolve the date range every render — cheap, and ties the URL query
  // string to the current filters without a state-mirroring effect.
  const { from, to } = useMemo(
    () => resolveDateRange(filters.preset, filters.customFrom, filters.customTo),
    [filters.preset, filters.customFrom, filters.customTo],
  );

  // Build a stable URL query string so the react-query key is stable across
  // renders. Empty params are omitted so the cache key matches whether the
  // filter is "all employees" or no filter at all.
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.projectId != null) params.set('project_id', String(filters.projectId));
    if (filters.developerId != null) params.set('developer_id', String(filters.developerId));
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [filters.projectId, filters.developerId, from, to]);

  const entriesQuery = useQuery<TimeEntriesResponse>({
    queryKey: ['admin', 'time-entries', filters.projectId, filters.developerId, from, to],
    queryFn: () => apiFetch<TimeEntriesResponse>(`/api/admin/time-entries${queryString}`),
    // Match the cadence other admin tabs use: refetch on focus but no
    // aggressive polling — time entries don't change often enough to warrant it.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Stabilize the empty-default reference — `?? []` produces a fresh array
  // every render, which would otherwise re-trigger `groupedRows` below and
  // any downstream memos. Per app/CLAUDE.md "Stabilize empty-default arrays".
  const rows = useMemo(() => entriesQuery.data?.rows ?? [], [entriesQuery.data?.rows]);
  const totalHours = entriesQuery.data?.total_hours ?? 0;
  const totalRows = entriesQuery.data?.total_rows ?? 0;
  const truncated = entriesQuery.data?.truncated ?? false;

  // When `groupBy !== 'none'`, bucket each entry into the period
  // (Sat→Fri week or calendar month) containing its logged_at timestamp.
  // Groups are sorted most-recent period first; entries inside keep the
  // server's DESC ordering. Returns null when grouping is off so the
  // render branch can short-circuit to the flat layout.
  //
  // Both modes produce the same `EntryGroup` shape so the render code
  // doesn't branch on the grouping kind — only the label format differs,
  // and that's pre-computed here.
  const groupedRows = useMemo<EntryGroup[] | null>(() => {
    if (filters.groupBy === 'none') return null;

    // `bucketize` returns the bucket start Date + pre-formatted label for
    // the chosen mode. Computed once and reused per row.
    const bucketize = (logged: Date): { start: Date; label: string } => {
      if (filters.groupBy === 'month') {
        const start = new Date(logged.getFullYear(), logged.getMonth(), 1);
        const label = start.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
        return { start, label };
      }
      // week (Sat→Fri)
      const start = startOfWeek(logged);
      const end = addDays(start, 6);
      const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return { start, label: `${startStr} → ${endStr}` };
    };

    const buckets = new Map<string, EntryGroup>();
    for (const row of rows) {
      const logged = new Date(row.logged_at);
      if (Number.isNaN(logged.getTime())) continue;
      const { start, label } = bucketize(logged);
      const key = formatLocalDate(start);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, label, totalHours: 0, entries: [], sortDate: start };
        buckets.set(key, bucket);
      }
      bucket.totalHours += row.hours || 0;
      bucket.entries.push(row);
    }
    return [...buckets.values()].sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  }, [filters.groupBy, rows]);

  // Reset button activates when any non-default field is set. Keep this in
  // lockstep with `resetFilters` below — if you add a field to one, add it
  // to the other or the button's enable/disable state will drift.
  const hasAnyFilter =
    filters.projectId != null ||
    filters.developerId != null ||
    filters.preset !== 'this_week' ||
    filters.customFrom !== '' ||
    filters.customTo !== '' ||
    filters.groupBy !== 'none';

  const resetFilters = () =>
    setFilters({
      projectId: null,
      developerId: null,
      preset: 'this_week',
      customFrom: '',
      customTo: '',
      groupBy: 'none',
    });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#E0B954]" />
            Time Entries
          </h2>
          <p className="text-xs text-[#737373] mt-1">
            Audit every hour logged across projects. Filter by project, employee, or date range.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4 space-y-4">
        {/* Date preset chips */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5 text-[#737373]" />
            <span className="text-xs font-medium text-[#737373]">Date range</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => {
              const active = filters.preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setFilters((f) => ({ ...f, preset: p.id }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#E0B954] text-black'
                      : 'bg-[rgba(255,255,255,0.04)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {filters.preset === 'custom' && (
            <CustomDateRangePicker
              from={filters.customFrom}
              to={filters.customTo}
              onFromChange={(v) => setFilters((f) => ({ ...f, customFrom: v }))}
              onToChange={(v) => setFilters((f) => ({ ...f, customTo: v }))}
            />
          )}
        </div>

        {/* Project + Employee dropdowns + Reset */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[11px] text-[#737373] block mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Project
            </label>
            <select
              value={filters.projectId ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  projectId: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F4F6FF] rounded-lg h-9 px-2 text-xs"
            >
              <option value="">All projects</option>
              {sortedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#737373] block mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Employee
            </label>
            <select
              value={filters.developerId ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  developerId: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F4F6FF] rounded-lg h-9 px-2 text-xs"
            >
              <option value="">All employees</option>
              {sortedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={resetFilters}
            disabled={!hasAnyFilter}
            className="h-9 px-3 rounded-lg text-xs font-medium text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.04)] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Total hours</p>
          <p className="text-2xl font-bold text-white mt-1">{totalHours}h</p>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Entries</p>
          <p className="text-2xl font-bold text-white mt-1">{totalRows}</p>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Range</p>
          <p className="text-sm font-medium text-white mt-1">
            {from ? formatRangeDate(from) : '—'} <span className="text-[#525252]">→</span>{' '}
            {to ? formatRangeDate(to) : '—'}
          </p>
        </div>
      </div>

      {/* Truncation warning */}
      {truncated && (
        <div className="rounded-lg border border-[#E0B954]/30 bg-[#E0B954]/10 p-3 flex items-center gap-2 text-xs text-[#E0B954]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Showing the first {totalRows} entries. Refine your filters to see the rest.
        </div>
      )}

      {/* Group-by toggle — sits above the table so it reads as a "view mode"
          rather than a filter (filters change the dataset; group-by just
          changes how that dataset is rendered). */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-[#737373] mr-1">Group by</span>
        {(
          [
            { id: 'none', label: 'None' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ] as const
        ).map((opt) => {
          const active = filters.groupBy === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, groupBy: opt.id }))}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                  : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] overflow-hidden">
        {entriesQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
          </div>
        ) : entriesQuery.isError ? (
          <div className="p-8 text-center text-sm text-red-400">Failed to load time entries.</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-8 h-8 text-[#525252] mx-auto mb-2" />
            <p className="text-sm text-[#737373]">No time entries match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[rgba(255,255,255,0.02)]">
                <tr className="text-left text-[11px] uppercase tracking-wider text-[#737373]">
                  <th className="px-4 py-2.5 font-medium">Logged at</th>
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium text-right">Hours</th>
                </tr>
              </thead>
              {groupedRows ? (
                // Grouped view — one <tbody> per group (week or month),
                // each with a header row (sub-total) and an entry row per
                // TimeEntry. Multiple <tbody>s in one <table> is valid
                // HTML and lets us scope the row dividers per group.
                groupedRows.map((group) => (
                  <tbody key={group.key} className="divide-y divide-[rgba(255,255,255,0.04)]">
                    <tr className="bg-[rgba(224,185,84,0.06)] border-t border-[#E0B954]/20">
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-xs font-semibold text-[#E0B954] uppercase tracking-wider"
                      >
                        {group.label}
                        <span className="ml-2 text-[10px] font-normal text-[#a3a3a3]">
                          ({group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                          )
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-[#E0B954]">
                        {group.totalHours}h
                      </td>
                    </tr>
                    {group.entries.map((row) => (
                      <EntryRow key={row.id} row={row} />
                    ))}
                  </tbody>
                ))
              ) : (
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {rows.map((row) => (
                    <EntryRow key={row.id} row={row} />
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeEntriesTab;
