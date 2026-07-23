import { useQuery } from '@tanstack/react-query';
import { Clock, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TimeEntriesResponse } from '@/client';
import { apiFetch } from '@/lib/api';
import TimeEntriesFilterBar from './TimeEntriesFilterBar';
import TimeEntriesSummary from './TimeEntriesSummary';
import TimeEntriesTable from './TimeEntriesTable';
import { aggregateEntries, resolveDateRange } from './types';
import type { EmployeeOption, FiltersState, ProjectOption, ViewMode } from './types';
import ViewModeToggle from './ViewModeToggle';
import type { WorkforceStatus } from '../../types';

/**
 * Admin Time Entries tab — a CEO-facing breakdown of every logged hour.
 *
 * A view switcher groups hours by Employee (default) or Project. Each
 * view shows ranked totals with a share-of-total bar, expandable to a
 * context-aware secondary breakdown (employee→projects, project→employees).
 *
 * Three filters compose with AND:
 *   - Date range (preset chips: Today / This week / This month / Last week / Last month / Custom)
 *   - Project (single-select from the admin projects list)
 *   - Employee (single-select from the admin employees list)
 *
 * Backend: GET /api/admin/time-entries (capability admin.time_entries).
 */

interface TimeEntriesTabProps {
  projects: ProjectOption[];
  employees: EmployeeOption[];
}

const TimeEntriesTab: React.FC<TimeEntriesTabProps> = ({ projects, employees }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>('employee');
  const [filters, setFilters] = useState<FiltersState>({
    projectId: null,
    developerId: null,
    preset: 'this_week',
    customFrom: '',
    customTo: '',
  });

  // Which group rows are expanded to show their breakdown. Rows start collapsed;
  // cleared on reset AND on view change (keys differ per view, so stale keys
  // from another view would silently mis-expand).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    setExpandedRows(new Set());
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

  // Workforce / QuickBooks sync status — only used to display the last-sync
  // timestamp on the header. Shares the cache key with the Integrations tab
  // so switching tabs is free; we don't care if it's stale (UI just reads
  // `last_sync_at`). The header hides itself when not connected.
  const workforceStatusQuery = useQuery<WorkforceStatus>({
    queryKey: ['admin', 'workforceStatus'],
    queryFn: () => apiFetch<WorkforceStatus>('/api/admin/workforce/status'),
    staleTime: 60_000,
  });
  const workforce = workforceStatusQuery.data;
  const lastSyncLabel = useMemo(() => {
    if (!workforce?.connected || !workforce.integration?.last_sync_at) return null;
    try {
      // Render in US Eastern with EST/EDT suffix — matches the Integrations
      // tab's formatTimestamp so the two screens read the same way.
      return new Date(workforce.integration.last_sync_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short',
      });
    } catch {
      return workforce.integration.last_sync_at;
    }
  }, [workforce]);

  // Stabilize the empty-default reference — `?? []` produces a fresh array
  // every render, which would re-trigger the aggregation memos below.
  const rows = useMemo(() => entriesQuery.data?.rows ?? [], [entriesQuery.data?.rows]);
  // Pre-aggregation raw row count from the server (used for the truncation notice).
  const totalRawRows = entriesQuery.data?.total_rows ?? 0;
  const truncated = entriesQuery.data?.truncated ?? false;

  // Grouped rows for the active view. Recomputed when the rows or the chosen
  // grouping change.
  const { groups } = useMemo(() => aggregateEntries(rows, viewMode), [rows, viewMode]);

  // Reset button activates when any non-default field is set. Keep this in
  // lockstep with `resetFilters` below.
  const hasAnyFilter =
    filters.projectId != null ||
    filters.developerId != null ||
    filters.preset !== 'this_week' ||
    filters.customFrom !== '' ||
    filters.customTo !== '';

  const resetFilters = () => {
    setFilters({
      projectId: null,
      developerId: null,
      preset: 'this_week',
      customFrom: '',
      customTo: '',
    });
    setExpandedRows(new Set());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#E0B954]" />
            Time Entries
          </h2>
          <p className="text-xs text-[#737373] mt-1">
            Where every logged hour went — grouped by employee or project.
          </p>
        </div>
        {lastSyncLabel && (
          <div
            className="inline-flex items-center gap-1.5 text-[11px] text-[#737373] shrink-0"
            title="Last successful sync of logged hours to QuickBooks. Manage from Admin → Integrations."
          >
            <RefreshCw className="w-3 h-3" />
            Last QuickBooks sync: <span className="text-[#a3a3a3]">{lastSyncLabel}</span>
          </div>
        )}
      </div>

      <TimeEntriesSummary totalRawRows={totalRawRows} truncated={truncated} from={from} to={to} />

      <TimeEntriesFilterBar
        filters={filters}
        setFilters={setFilters}
        sortedProjects={sortedProjects}
        sortedEmployees={sortedEmployees}
        hasAnyFilter={hasAnyFilter}
        onReset={resetFilters}
      />

      {/* View switcher: group hours by employee (default) or project. */}
      <div className="flex items-center justify-between gap-4">
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
        <span className="text-xs text-[#737373]">
          {groups.length} {groups.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      <TimeEntriesTable
        isLoading={entriesQuery.isLoading}
        isError={entriesQuery.isError}
        viewMode={viewMode}
        rows={groups}
        expandedRows={expandedRows}
        onToggleRow={toggleRow}
      />
    </div>
  );
};

export default TimeEntriesTab;
