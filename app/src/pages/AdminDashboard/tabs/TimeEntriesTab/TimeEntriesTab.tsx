import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TimeEntriesResponse } from '@/client';
import { formatLocalDate } from '@/components/ProjectsPage/utils';
import { apiFetch } from '@/lib/api';
import TimeEntriesFilterBar from './TimeEntriesFilterBar';
import TimeEntriesSummary from './TimeEntriesSummary';
import TimeEntriesTable from './TimeEntriesTable';
import { addDays, resolveDateRange, startOfWeek } from './types';
import type {
  AggregatedRow,
  EmployeeOption,
  EntryGroup,
  FiltersState,
  GroupBy,
  ProjectOption,
} from './types';

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

interface TimeEntriesTabProps {
  projects: ProjectOption[];
  employees: EmployeeOption[];
}

const TimeEntriesTab: React.FC<TimeEntriesTabProps> = ({ projects, employees }) => {
  const [filters, setFilters] = useState<FiltersState>({
    projectId: null,
    developerId: null,
    preset: 'this_week',
    customFrom: '',
    customTo: '',
    groupBy: 'none',
  });

  // Collapsible groups start fully collapsed; the user expands the periods they
  // care about. Cleared on reset / group-by switch so stale keys can't re-open.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Switch grouping mode and reset which groups are expanded (every entry into
  // a grouping mode starts collapsed, per the default-collapsed contract).
  const handleGroupByChange = (groupBy: GroupBy) => {
    setFilters((f) => ({ ...f, groupBy }));
    setExpandedGroups(new Set());
  };

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
  // Pre-aggregation row count from the server (used for the truncation notice);
  // the Entries card shows the post-aggregation count below.
  const totalRawRows = entriesQuery.data?.total_rows ?? 0;
  const truncated = entriesQuery.data?.truncated ?? false;

  // Collapse raw entries by (employee, project, local-day), summing hours. This
  // is the row set the table actually renders — both flat and grouped.
  const aggregatedRows = useMemo<AggregatedRow[]>(() => {
    const buckets = new Map<string, AggregatedRow>();
    for (const row of rows) {
      const d = new Date(row.logged_at);
      if (Number.isNaN(d.getTime())) continue;
      const dayKey = formatLocalDate(d);
      const empPart =
        row.developer_id != null ? `e${row.developer_id}` : `n${row.developer_name ?? ''}`;
      const projPart = row.project_id != null ? `p${row.project_id}` : `n${row.project_name ?? ''}`;
      const key = `${dayKey}|${empPart}|${projPart}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.hours += row.hours || 0;
        // Keep the latest raw timestamp so the date cell reflects the most
        // recent action in the bucket (cosmetic near a day boundary).
        if (new Date(row.logged_at).getTime() > new Date(existing.logged_at).getTime()) {
          existing.logged_at = row.logged_at;
        }
      } else {
        buckets.set(key, {
          key,
          dayKey,
          logged_at: row.logged_at,
          hours: row.hours || 0,
          developer_name: row.developer_name,
          project_name: row.project_name,
        });
      }
    }
    return [...buckets.values()].sort((a, b) => {
      // dayKey is YYYY-MM-DD, so lexicographic comparison is correct.
      if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? 1 : -1;
      const ea = (a.developer_name ?? '').toLowerCase();
      const eb = (b.developer_name ?? '').toLowerCase();
      if (ea !== eb) return ea < eb ? -1 : 1;
      const pa = (a.project_name ?? '').toLowerCase();
      const pb = (b.project_name ?? '').toLowerCase();
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
  }, [rows]);

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

    // Iterate the AGGREGATED rows so each week/month bucket reflects the
    // (employee, project, day) collapse — group totals are unchanged (sum is
    // preserved) but the entry list shows collapsed rows, not raw entries.
    const buckets = new Map<string, EntryGroup>();
    for (const row of aggregatedRows) {
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
  }, [filters.groupBy, aggregatedRows]);

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

  const resetFilters = () => {
    setFilters({
      projectId: null,
      developerId: null,
      preset: 'this_week',
      customFrom: '',
      customTo: '',
      groupBy: 'none',
    });
    // A full reset returns to the empty collapsed state so stale expanded keys
    // can't linger and re-open on the next group-by.
    setExpandedGroups(new Set());
  };

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

      <TimeEntriesFilterBar
        filters={filters}
        setFilters={setFilters}
        sortedProjects={sortedProjects}
        sortedEmployees={sortedEmployees}
        hasAnyFilter={hasAnyFilter}
        onReset={resetFilters}
      />

      <TimeEntriesSummary
        totalHours={totalHours}
        entriesCount={aggregatedRows.length}
        totalRawRows={totalRawRows}
        truncated={truncated}
        from={from}
        to={to}
        groupBy={filters.groupBy}
        onGroupByChange={handleGroupByChange}
      />

      <TimeEntriesTable
        isLoading={entriesQuery.isLoading}
        isError={entriesQuery.isError}
        rows={aggregatedRows}
        groupedRows={groupedRows}
        expandedGroups={expandedGroups}
        onToggleGroup={toggleGroup}
      />
    </div>
  );
};

export default TimeEntriesTab;
