import React, { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  TrendingUp,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Employee {
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  avatar_url: string | null;
  specialization: string | null;
  created_at: string;
  updated_at: string;
  project_count: number;
  assigned_items_count: number;
}

interface CapacityTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string | null;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  started_at: string | null;
  last_assigned_at: string | null;
  completed_at: string | null;
  counted_hours: number;
  counted_basis: string;
}

interface DeveloperCapacity {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  avatar_url: string | null;
  project_count: number;
  this_week_in_progress_hours: number;
  this_week_in_review_hours: number;
  this_week_done_hours: number;
  this_week_capacity_used: number;
  this_week_remaining_capacity: number;
  week_start?: string;
  week_end?: string;
  tickets?: CapacityTicket[];
  specialization: string | null;
}

interface TeamCapacity {
  perDev: Array<{
    id: number;
    name: string;
    inProgress: number;
    inReview: number;
    done: number;
    used: number;
    remaining: number;
    utilization: number;
    status: 'Available' | 'Moderate' | 'Busy';
  }>;
  totalCapacity: number;
  totalUsed: number;
  totalInProgress: number;
  totalInReview: number;
  totalDone: number;
  totalRemaining: number;
  counts: Record<'Available' | 'Moderate' | 'Busy', number>;
  utilization: number;
  weekStart?: string;
  weekEnd?: string;
}

interface EmployeesTabProps {
  employees: Employee[];
  developerCapacities: DeveloperCapacity[];
  teamCapacity: TeamCapacity;
  availableSpecs: string[];
  onCreateEmployee: () => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (id: number) => void;
}

const PROJECT_COLOR_PALETTE = [
  '#E0B954',
  '#A78BFA',
  '#34D399',
  '#60A5FA',
  '#F97316',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#94A3B8',
  '#EF4444',
];
const projectColor = (projectId: number) =>
  PROJECT_COLOR_PALETTE[Math.abs(projectId) % PROJECT_COLOR_PALETTE.length];

const statusBadgeColor = (status: string) => {
  if (status === 'in_progress') return '#E0B954';
  if (status === 'in_review') return '#A78BFA';
  if (status === 'done') return '#34D399';
  if (status === 'blocked') return '#EF4444';
  return '#737373';
};

const WEEKLY_CAPACITY_HRS = 40;

type EmployeeSortKey = 'name' | 'projects' | 'assigned' | 'capacity';

const EmployeesTab: React.FC<EmployeesTabProps> = ({
  employees,
  developerCapacities,
  teamCapacity,
  availableSpecs,
  onCreateEmployee,
  onEditEmployee,
  onDeleteEmployee,
}) => {
  const [expandedCapacityDevId, setExpandedCapacityDevId] = useState<number | null>(null);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<
    'all' | 'Available' | 'Moderate' | 'Busy'
  >('all');
  const [employeeSpecFilter, setEmployeeSpecFilter] = useState<string>('all');
  const [employeeSort, setEmployeeSort] = useState<{ key: EmployeeSortKey; dir: 'asc' | 'desc' }>({
    key: 'capacity',
    dir: 'desc',
  });

  const handleEmployeeSort = (key: EmployeeSortKey) => {
    setEmployeeSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const filteredEmployeeRows = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const rows = employees.map((emp) => {
      const cap = developerCapacities.find((d) => d.developer_id === emp.id);
      const used = cap?.this_week_capacity_used ?? 0;
      const inProgress = cap?.this_week_in_progress_hours ?? 0;
      const inReview = cap?.this_week_in_review_hours ?? 0;
      const done = cap?.this_week_done_hours ?? 0;
      const remaining = Math.max(0, WEEKLY_CAPACITY_HRS - used);
      const status: 'Available' | 'Moderate' | 'Busy' =
        remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
      return { emp, used, inProgress, inReview, done, remaining, status };
    });

    const filtered = rows.filter((r) => {
      if (q && !(r.emp.name.toLowerCase().includes(q) || r.emp.email.toLowerCase().includes(q)))
        return false;
      if (employeeStatusFilter !== 'all' && r.status !== employeeStatusFilter) return false;
      if (employeeSpecFilter !== 'all' && (r.emp.specialization || '') !== employeeSpecFilter)
        return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (employeeSort.key) {
        case 'name':
          av = a.emp.name.toLowerCase();
          bv = b.emp.name.toLowerCase();
          break;
        case 'projects':
          av = a.emp.project_count;
          bv = b.emp.project_count;
          break;
        case 'assigned':
          av = a.emp.assigned_items_count;
          bv = b.emp.assigned_items_count;
          break;
        case 'capacity':
        default:
          av = a.used;
          bv = b.used;
          break;
      }
      if (av < bv) return employeeSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return employeeSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    employees,
    developerCapacities,
    employeeSearch,
    employeeStatusFilter,
    employeeSpecFilter,
    employeeSort,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Team Members</h2>
        <Button
          onClick={onCreateEmployee}
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Button>
      </div>

      {employees.length > 0 && (
        <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#E0B954]" />
                <h3 className="text-sm font-semibold text-white">Team Capacity Overview</h3>
              </div>
              <div className="text-xs text-[#737373] mt-1">
                Week:{' '}
                <span className="text-[#a3a3a3] font-mono">
                  {teamCapacity.weekStart
                    ? new Date(teamCapacity.weekStart).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—'}
                  {' → '}
                  {teamCapacity.weekEnd
                    ? new Date(teamCapacity.weekEnd).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—'}
                </span>
                <span className="ml-2 text-[#737373]">(Sat → Fri, UTC)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(
                [
                  {
                    key: 'Available',
                    count: teamCapacity.counts.Available,
                    base: 'rgba(224,185,84',
                    text: '#E0B954',
                  },
                  {
                    key: 'Moderate',
                    count: teamCapacity.counts.Moderate,
                    base: 'rgba(245,158,11',
                    text: '#F59E0B',
                  },
                  {
                    key: 'Busy',
                    count: teamCapacity.counts.Busy,
                    base: 'rgba(239,68,68',
                    text: '#EF4444',
                  },
                ] as const
              ).map((pill) => {
                const active = employeeStatusFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    onClick={() => setEmployeeStatusFilter(active ? 'all' : pill.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? 'ring-1 ring-offset-0' : 'hover:opacity-90'}`}
                    style={{
                      backgroundColor: active ? `${pill.base},0.25)` : `${pill.base},0.12)`,
                      color: pill.text,
                      borderColor: `${pill.base},${active ? '0.45' : '0.2'})`,
                    }}
                    title={active ? 'Clear filter' : `Show only ${pill.key} developers`}
                  >
                    {pill.count} {pill.key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
              <div className="text-[10px] uppercase tracking-wider text-[#737373]">Headcount</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {teamCapacity.perDev.length}
              </div>
            </div>
            <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
              <div className="text-[10px] uppercase tracking-wider text-[#737373]">Hours Used</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {teamCapacity.totalUsed}
                <span className="text-sm text-[#737373] font-normal">
                  {' '}
                  / {teamCapacity.totalCapacity}h
                </span>
              </div>
            </div>
            <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
              <div className="text-[10px] uppercase tracking-wider text-[#737373]">Utilization</div>
              <div
                className={`text-xl font-bold tabular-nums mt-1 ${
                  teamCapacity.utilization >= 90
                    ? 'text-[#EF4444]'
                    : teamCapacity.utilization >= 70
                      ? 'text-[#F59E0B]'
                      : 'text-[#34D399]'
                }`}
              >
                {teamCapacity.utilization}%
              </div>
            </div>
            <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
              <div className="text-[10px] uppercase tracking-wider text-[#737373]">
                Slack Remaining
              </div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {teamCapacity.totalRemaining}h
              </div>
            </div>
          </div>

          {/* Team-wide stacked bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-[#737373] mb-1.5">
              <span>Team workload split</span>
              <span className="font-mono tabular-nums">
                {teamCapacity.totalUsed}h of {teamCapacity.totalCapacity}h
              </span>
            </div>
            <div className="h-3 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#E0B954]"
                style={{
                  width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInProgress / teamCapacity.totalCapacity) * 100 : 0}%`,
                }}
                title={`In progress: ${teamCapacity.totalInProgress}h`}
              />
              <div
                className="h-full bg-[#A78BFA]"
                style={{
                  width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInReview / teamCapacity.totalCapacity) * 100 : 0}%`,
                }}
                title={`In review: ${teamCapacity.totalInReview}h`}
              />
              <div
                className="h-full bg-[#34D399]"
                style={{
                  width: `${teamCapacity.totalCapacity ? (teamCapacity.totalDone / teamCapacity.totalCapacity) * 100 : 0}%`,
                }}
                title={`Done: ${teamCapacity.totalDone}h`}
              />
            </div>
            <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#E0B954]" />
                In progress · {teamCapacity.totalInProgress}h
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#A78BFA]" />
                In review · {teamCapacity.totalInReview}h
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#34D399]" />
                Done · {teamCapacity.totalDone}h
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[rgba(255,255,255,0.15)]" />
                Remaining · {teamCapacity.totalRemaining}h
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 pl-8 text-sm"
          />
        </div>
        {availableSpecs.length > 0 && (
          <select
            value={employeeSpecFilter}
            onChange={(e) => setEmployeeSpecFilter(e.target.value)}
            className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
            title="Filter by specialization"
          >
            <option value="all">All specializations</option>
            {availableSpecs.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        )}
        <select
          value={employeeStatusFilter}
          onChange={(e) => setEmployeeStatusFilter(e.target.value as typeof employeeStatusFilter)}
          className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
          title="Filter by capacity status"
        >
          <option value="all">All statuses</option>
          <option value="Available">Available</option>
          <option value="Moderate">Moderate</option>
          <option value="Busy">Busy</option>
        </select>
        {(employeeSearch || employeeStatusFilter !== 'all' || employeeSpecFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEmployeeSearch('');
              setEmployeeStatusFilter('all');
              setEmployeeSpecFilter('all');
            }}
            className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
          >
            Clear filters
          </Button>
        )}
        <div className="ml-auto text-xs text-[#737373]">
          {filteredEmployeeRows.length} of {employees.length}
        </div>
      </div>

      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.05)]">
              {(
                [
                  { key: 'name' as const, label: 'Name', sortable: true, align: 'left' },
                  { key: null, label: 'Email', sortable: false, align: 'left' },
                  { key: null, label: 'GitHub', sortable: false, align: 'left' },
                  {
                    key: 'projects' as const,
                    label: 'Projects',
                    sortable: true,
                    align: 'left',
                  },
                  {
                    key: 'assigned' as const,
                    label: 'Assigned',
                    sortable: true,
                    align: 'left',
                  },
                  {
                    key: 'capacity' as const,
                    label: 'Capacity',
                    sortable: true,
                    align: 'left',
                  },
                  { key: null, label: 'Actions', sortable: false, align: 'right' },
                ] as const
              ).map((col, i) => {
                const isActive = col.sortable && col.key && employeeSort.key === col.key;
                const ArrowIcon = isActive
                  ? employeeSort.dir === 'asc'
                    ? ChevronUp
                    : ChevronDown
                  : ArrowUpDown;
                const baseCls = `text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3 ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                if (!col.sortable || !col.key) {
                  return (
                    <th key={i} className={baseCls}>
                      {col.label}
                    </th>
                  );
                }
                return (
                  <th key={i} className={baseCls}>
                    <button
                      onClick={() => handleEmployeeSort(col.key as EmployeeSortKey)}
                      className={`inline-flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      <ArrowIcon className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredEmployeeRows.map(({ emp }) => {
              const devCapacity = developerCapacities.find((d) => d.developer_id === emp.id);
              const capacityUsed = devCapacity?.this_week_capacity_used ?? 0;
              const capacityPercentage = Math.round((capacityUsed / 40) * 100);
              const remaining = devCapacity?.this_week_remaining_capacity ?? 40;
              const capacityStatus =
                remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
              const isExpanded = expandedCapacityDevId === emp.id;
              const tickets = devCapacity?.tickets ?? [];

              // Group tickets by project for inline distribution + expanded view
              const projectGroupsMap = tickets.reduce<
                Record<
                  number,
                  {
                    projectId: number;
                    projectName: string;
                    tickets: CapacityTicket[];
                    total: number;
                  }
                >
              >((acc, t) => {
                const pid = t.project_id;
                if (!acc[pid])
                  acc[pid] = {
                    projectId: pid,
                    projectName: t.project_name || `Project ${pid}`,
                    tickets: [],
                    total: 0,
                  };
                acc[pid].tickets.push(t);
                acc[pid].total += t.counted_hours;
                return acc;
              }, {});
              const projectsByHours = Object.values(projectGroupsMap).sort(
                (a, b) => b.total - a.total,
              );

              return (
                <React.Fragment key={emp.id}>
                  <tr
                    className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] ${isExpanded ? 'bg-[rgba(255,255,255,0.015)]' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954]">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{emp.name}</div>
                          {emp.specialization && (
                            <div className="text-xs text-[#737373] capitalize">
                              {emp.specialization}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.email}</td>
                    <td className="px-5 py-4 text-sm text-[#737373]">
                      {emp.github_username || '-'}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.project_count}</td>
                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.assigned_items_count}</td>
                    <td
                      className="px-5 py-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                      onClick={() => setExpandedCapacityDevId(isExpanded ? null : emp.id)}
                      title="Click to see ticket-level breakdown"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 max-w-xs">
                          <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                            {projectsByHours.map((p) => (
                              <div
                                key={p.projectId}
                                className="h-full"
                                style={{
                                  width: `${Math.min(100, (p.total / 40) * 100)}%`,
                                  backgroundColor: projectColor(p.projectId),
                                }}
                                title={`${p.projectName}: ${p.total}h (${p.tickets.length} ticket${p.tickets.length === 1 ? '' : 's'})`}
                              />
                            ))}
                          </div>
                          <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-2 flex-wrap">
                            {projectsByHours.length === 0 ? (
                              <span>No tickets this week</span>
                            ) : (
                              <>
                                {projectsByHours.slice(0, 3).map((p, i) => (
                                  <React.Fragment key={p.projectId}>
                                    {i > 0 && (
                                      <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <span
                                        className="w-1.5 h-1.5 rounded-sm"
                                        style={{
                                          backgroundColor: projectColor(p.projectId),
                                        }}
                                      />
                                      <span
                                        className="truncate max-w-[120px]"
                                        title={p.projectName}
                                      >
                                        {p.projectName}
                                      </span>
                                      <span>· {p.total}h</span>
                                    </span>
                                  </React.Fragment>
                                ))}
                                {projectsByHours.length > 3 && (
                                  <>
                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                    <span>+{projectsByHours.length - 3} more</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium whitespace-nowrap ${
                            capacityStatus === 'Available'
                              ? 'text-[#E0B954]'
                              : capacityStatus === 'Busy'
                                ? 'text-[#F59E0B]'
                                : 'text-[#a3a3a3]'
                          }`}
                        >
                          {capacityStatus} · {capacityUsed}h/40h ({capacityPercentage}%)
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditEmployee(emp)}
                          className="text-[#737373] hover:text-white h-8 w-8 p-0"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteEmployee(emp.id)}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-[rgba(255,255,255,0.03)] bg-[rgba(0,0,0,0.25)]">
                      <td colSpan={7} className="px-5 py-5">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-xs text-[#737373]">
                              Week:{' '}
                              <span className="text-[#a3a3a3] font-mono">
                                {devCapacity?.week_start
                                  ? new Date(devCapacity.week_start).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                                {' → '}
                                {devCapacity?.week_end
                                  ? new Date(devCapacity.week_end).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </span>
                              <span className="ml-2 text-[#737373]">(Sat → Fri, UTC)</span>
                            </div>
                            {tickets.length === 0 && (
                              <span className="text-xs text-[#737373]">
                                No tickets contributing this week.
                              </span>
                            )}
                          </div>

                          {projectsByHours.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {projectsByHours.map((p) => {
                                const color = projectColor(p.projectId);
                                const sortedTickets = [...p.tickets].sort(
                                  (a, b) => b.counted_hours - a.counted_hours,
                                );
                                return (
                                  <div
                                    key={p.projectId}
                                    className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                          style={{ backgroundColor: color }}
                                        />
                                        <span
                                          className="text-xs font-semibold text-white truncate"
                                          title={p.projectName}
                                        >
                                          {p.projectName}
                                        </span>
                                        <span className="text-[10px] text-[#737373] flex-shrink-0">
                                          ({p.tickets.length})
                                        </span>
                                      </div>
                                      <span
                                        className="text-xs font-mono tabular-nums flex-shrink-0"
                                        style={{ color }}
                                      >
                                        {p.total}h
                                      </span>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {sortedTickets.map((t) => {
                                        const sColor = statusBadgeColor(t.status);
                                        return (
                                          <li key={t.id} className="flex items-start gap-2 text-xs">
                                            <span className="font-mono text-[#E0B954] mt-0.5 flex-shrink-0">
                                              {t.key}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              <div className="text-white truncate">{t.title}</div>
                                              <div className="text-[10px] text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                <span
                                                  className="px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                                                  style={{
                                                    backgroundColor: `${sColor}22`,
                                                    color: sColor,
                                                    fontSize: '9px',
                                                  }}
                                                >
                                                  {t.status.replace('_', ' ')}
                                                </span>
                                                <span>est {t.estimated_hours}h</span>
                                                <span className="text-[rgba(255,255,255,0.15)]">
                                                  ·
                                                </span>
                                                <span>logged {t.logged_hours}h</span>
                                                <span className="text-[rgba(255,255,255,0.15)]">
                                                  ·
                                                </span>
                                                <span>remaining {t.remaining_hours}h</span>
                                                {t.counted_basis === 'remaining (transferred)' && (
                                                  <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">
                                                    transferred
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <span
                                              className="font-mono tabular-nums flex-shrink-0"
                                              style={{ color }}
                                              title={`Counted as ${t.counted_basis}`}
                                            >
                                              +{t.counted_hours}h
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && (
          <div className="text-center py-12 text-[#737373]">
            No employees yet. Click "Add Employee" to get started.
          </div>
        )}
        {employees.length > 0 && filteredEmployeeRows.length === 0 && (
          <div className="text-center py-12 text-sm text-[#737373]">
            No employees match the current filters.
          </div>
        )}
      </div>
    </div>
  );
};

export type { Employee, DeveloperCapacity, CapacityTicket, TeamCapacity };
export default EmployeesTab;
