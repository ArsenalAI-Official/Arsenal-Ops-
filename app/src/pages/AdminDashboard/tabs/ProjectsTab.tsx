import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Ticket,
  Github,
  Settings,
  ExternalLink,
  Mail,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Tag,
  Filter,
  Loader2,
  CalendarRange,
  LayoutGrid,
  TableProperties,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { TASK_TYPE_CONFIG } from '@/components/ProjectsPage/constants';
import type { ProjectCategory } from '../modals/CategoryManagerModal';

/** One ticket row in the per-project drill-down. Mirrors the backend's
 *  `WeeklyTicket` Pydantic model. */
interface WeeklyTicket {
  id: number;
  key: string | null;
  title: string;
  type: string;
  priority: string;
  assignee_name: string | null;
  estimated_hours: number | null;
  logged_hours: number | null;
  completed_at: string | null;
}

/** Bucketed ticket lists for one project. Returned in one shot so flipping
 *  between the ToDo/Backlog / In progress / In review / Done buttons is a
 *  pure client switch. `todo_backlog` collapses the `backlog` and `todo`
 *  workflow statuses into one UI bucket per the admin Reports drill-down. */
interface ProjectWeeklyTickets {
  todo_backlog: WeeklyTicket[];
  in_progress: WeeklyTicket[];
  in_review: WeeklyTicket[];
  done_this_week: WeeklyTicket[];
}

type StatusBucket = 'todo_backlog' | 'in_progress' | 'in_review' | 'done_this_week';

/** Per-project row in the weekly report table. Mirrors the backend's
 *  `ProjectWeeklyReportRow` Pydantic model. */
export interface WeeklyReportRow {
  project_id: number;
  project_name: string;
  category_id: number | null;
  category_name: string | null;
  todo_backlog: number;
  in_progress: number;
  in_review: number;
  done_this_week: number;
}

/** Whole-payload shape from `GET /api/admin/projects/weekly-report`. */
export interface WeeklyReport {
  week_start: string;
  week_end: string;
  rows: WeeklyReportRow[];
}

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  total_items: number;
  done_items: number;
  completion_pct: number;
  developer_count: number;
  github_repo_url: string | null;
  github_repo_urls?: string[];
  github_repo_name: string | null;
  has_github_token: boolean;
  category_id: number | null;
  category_name: string | null;
}

interface ProjectsTabProps {
  /** Already filtered list — parent applies the category filter before
   *  passing it in so this tab stays pure presentational. */
  projects: Project[];
  /** Full category list for the filter dropdown + per-card category picker. */
  categories: ProjectCategory[];
  /** Encoded filter value: 'all' | 'uncategorized' | '<numeric id>'. */
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  onOpenCategoryManager: () => void;
  /** Assign / change / clear a project's category. Pass `null` to clear. */
  onSetProjectCategory: (projectId: number, categoryId: number | null) => void;
  /** Weekly report for the projects currently in scope (server applies the
   *  same category filter). `null` while loading and on fetch error. */
  weeklyReport: WeeklyReport | null;
  weeklyReportLoading: boolean;
  invitingProjectId: number | null;
  onEditGitHubSettings: (project: Project, e: React.MouseEvent) => void;
  onSendGitHubInvites: (project: Project, e: React.MouseEvent) => void;
  onOpenProjectMembers: (project: Project, e: React.MouseEvent) => void;
  /** Gates write affordances: Manage Categories, per-card category Select,
   *  Edit GitHub Settings, Send GitHub Invites. The filter dropdown and
   *  read-only project list stay visible for read-only admins. */
  canWriteProjects: boolean;
}

/** Compact "Jun 1 – 7, 2026" range for the report header. Same-month dates
 *  collapse to a single month name; cross-month ranges show both. Parses ISO
 *  strings without going through native `new Date(string)` for an ISO with
 *  timezone (which is safe here — backend emits UTC timestamps and we just
 *  want the calendar dates the user expects to see). */
function formatWeekRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const startStr = `${start.toLocaleDateString('en-US', { ...monthFmt, timeZone: 'UTC' })} ${start.getUTCDate()}`;
  const endStr = sameMonth
    ? `${end.getUTCDate()}`
    : `${end.toLocaleDateString('en-US', { ...monthFmt, timeZone: 'UTC' })} ${end.getUTCDate()}`;
  return `${startStr} – ${endStr}, ${end.getUTCFullYear()}`;
}

// Sentinel string for the "no category" option inside the per-card Select.
// Using a string-literal (not '' which Radix Select rejects) avoids the
// silent "Select.Item must have a value prop that is not an empty string"
// runtime error.
const UNCATEGORIZED_OPTION = '__uncategorized__';

// Status-accent palette for the Reports view. Matches the canonical
// home-page palette in `components/ProjectsPage/constants.ts` (STATUS_COLOR /
// STATUS_CONFIG) so the status colors stay consistent across the app —
// kanban dropdown, MyTasks/Upcoming list, and this admin Reports view all
// share the same visual vocabulary. Tints (`bg`) are the hex `color` at ~12%
// alpha for use as soft tile backgrounds.
const STATUS_ACCENTS: Record<StatusBucket, { color: string; bg: string; label: string }> = {
  todo_backlog: { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', label: 'ToDo / Backlog' },
  in_progress: { color: '#E0B954', bg: 'rgba(224,185,84,0.12)', label: 'In progress' },
  in_review: { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', label: 'In review' },
  done_this_week: { color: '#34D399', bg: 'rgba(52,211,153,0.14)', label: 'Done' },
};

// Priority-accent palette for ticket rows in the expanded drill-down. Same
// scale used by the kanban card / item detail drawer so the dot encodes a
// familiar urgency signal at a glance.
const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#737373',
};

const ProjectsTab = ({
  projects,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  onOpenCategoryManager,
  onSetProjectCategory,
  weeklyReport,
  weeklyReportLoading,
  invitingProjectId,
  onEditGitHubSettings,
  onSendGitHubInvites,
  onOpenProjectMembers,
  canWriteProjects,
}: ProjectsTabProps) => {
  const navigate = useNavigate();

  // Sub-view toggle inside the tab. 'cards' (default) shows the existing
  // project-card grid. 'reports' shows the per-project weekly table with
  // expandable rows. Filter + manage-categories controls in the tab header
  // apply to both views.
  const [view, setView] = useState<'cards' | 'reports'>('cards');

  // Free-text search applied on top of the category filter. Matches the
  // project name and description (case-insensitive substring). Local state
  // because it's purely UI — the parent stays unaware of search semantics.
  const [projectSearch, setProjectSearch] = useState<string>('');

  // Which row in the reports table is expanded — null when none. Reset to
  // null whenever the user switches back to 'cards' so re-entering 'reports'
  // starts collapsed.
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);

  // Apply the search filter on top of the category-filtered list the parent
  // passes in. Memoized so the cards view and the reports table see the
  // same reference and the downstream `.sort()`/`.map()` chains don't
  // recompute when unrelated state changes.
  const searchedProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);

  // Sort report rows alphabetically by project name (case- and
  // accent-insensitive), matching the order used by the project cards
  // view, the home-page Projects box, and the task-dialog dropdowns.
  // `.slice()` copies before sorting so we don't mutate the cache payload.
  // Search filter applied here too so both views (cards + reports) honor
  // the same user-typed query. WeeklyReportRow only carries `project_name`,
  // so search is name-only on the reports side — description isn't part of
  // that payload.
  const reportRows = (weeklyReport?.rows ?? [])
    .slice()
    .filter((r) => {
      const q = projectSearch.trim().toLowerCase();
      if (!q) return true;
      return r.project_name.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      a.project_name.localeCompare(b.project_name, undefined, { sensitivity: 'base' }),
    );
  const reportRange = weeklyReport
    ? formatWeekRange(weeklyReport.week_start, weeklyReport.week_end)
    : '';
  // Aggregate footer numbers — handy when the filter narrows to a category.
  const totals = reportRows.reduce(
    (acc, r) => ({
      todo_backlog: acc.todo_backlog + r.todo_backlog,
      in_progress: acc.in_progress + r.in_progress,
      in_review: acc.in_review + r.in_review,
      done_this_week: acc.done_this_week + r.done_this_week,
    }),
    { todo_backlog: 0, in_progress: 0, in_review: 0, done_this_week: 0 },
  );

  return (
    <div className="space-y-4">
      {/* Header — title + category filter + manage-categories button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-white">All Projects</h2>

        <div className="flex items-center gap-2">
          {/* Free-text search — matches name + description across the
              category-filtered list. Same input style as the Users tab
              search so the admin shell stays uniform. */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
            <Input
              placeholder="Search projects…"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="pl-8 w-56 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 text-sm focus:border-[#E0B954]/50"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#737373]">
            <Filter className="w-3.5 h-3.5" />
            Category
          </div>
          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger className="w-[200px] bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-white h-9">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
              <SelectItem value="all" className="text-white">
                All categories
              </SelectItem>
              <SelectItem value="uncategorized" className="text-white">
                Uncategorized
              </SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)} className="text-white">
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Clear-filters affordance — surfaces when search OR a non-"all"
              category is active. Mirrors the UsersTab pattern so both
              tabs reset the same way. Resets both at once, even if only
              one of them is set, so the "back to default" expectation is
              consistent. */}
          {(projectSearch !== '' || categoryFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setProjectSearch('');
                onCategoryFilterChange('all');
              }}
              className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
            >
              Clear filters
            </Button>
          )}
          {/* Result count — always shown so the admin sees the size of
              the current list at a glance. Mirrors UsersTab's "{x} of {y}"
              indicator. `projects` here is the parent's category-filtered
              list; the count denominator is therefore "after category
              filter", which is the largest meaningful baseline given the
              parent owns the category filter. */}
          <div className="text-xs text-[#737373]">
            {searchedProjects.length} of {projects.length}
          </div>
          {/* Match "Back to Projects" button style — ghost variant, muted
              foreground that brightens on hover. Keeps the header visual
              hierarchy consistent across the admin shell.
              Hidden without `admin.projects_write` so read-only admins
              don't see an entry point that would 403 on category mutation. */}
          {canWriteProjects && (
            <Button
              variant="ghost"
              onClick={onOpenCategoryManager}
              className="text-[#737373] hover:text-white"
            >
              <Tag className="w-4 h-4 mr-2" />
              Manage categories
            </Button>
          )}
        </div>
      </div>

      {/* Sub-view toggle: Cards (default) | Reports. Mirrors the
          Capacity / Logged-hours pill toggle pattern used inside an expanded
          row in EmployeesTab — same active/inactive styling, same shape. */}
      <div className="flex items-center gap-2">
        {[
          { id: 'cards' as const, label: 'Cards', icon: LayoutGrid },
          { id: 'reports' as const, label: 'Reports', icon: TableProperties },
        ].map((opt) => {
          const active = view === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setView(opt.id);
                // Collapse any expanded row when leaving Reports so a return
                // visit starts fresh.
                if (opt.id !== 'reports') setExpandedProjectId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                active
                  ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                  : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Reports view — per-project weekly table with expandable rows. Each
          row reveals 3 status pills + a ticket list on click, replicating
          the EmployeesTab capacity drill-down pattern. */}
      {view === 'reports' && (
        <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
          {/* Header strip — gives the report a clear identity vs the bare
              table it used to be. Icon tile + title + pill-style date range
              + helper text explaining which column is week-windowed. */}
          {reportRows.length > 0 && (
            <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(224,185,84,0.1)] flex items-center justify-center border border-[rgba(224,185,84,0.15)]">
                    <CalendarRange className="w-4 h-4 text-[#E0B954]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight">
                      Weekly Status Snapshot
                    </p>
                    {reportRange && (
                      <p className="text-[11px] text-[#737373] mt-0.5">
                        <span className="font-mono text-[#a3a3a3]">{reportRange}</span>
                        <span className="text-[rgba(255,255,255,0.15)] mx-1.5">·</span>
                        <span>Sat → Fri, UTC</span>
                      </p>
                    )}
                  </div>
                </div>
                {weeklyReportLoading && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#737373]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Refreshing
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#737373] mt-2.5 leading-relaxed">
                <span className="text-[#a3a3a3] font-medium">Done</span> shows tickets marked done
                this week. The other columns are current-state snapshots across the project.
              </p>
            </div>
          )}

          {weeklyReportLoading && reportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-[#737373]">
              <Loader2 className="w-4 h-4 animate-spin text-[#E0B954]" />
              <span>Loading report…</span>
            </div>
          ) : reportRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TableProperties />
                </EmptyMedia>
                <EmptyTitle>No report data</EmptyTitle>
                <EmptyDescription>
                  {projectSearch.trim()
                    ? 'No projects match your search.'
                    : 'Nothing matches the current category filter.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left font-semibold px-4 py-2.5 w-8"></th>
                  <th className="text-left font-semibold px-4 py-2.5">Project</th>
                  <th className="text-right font-semibold px-4 py-2.5 w-32">
                    <span style={{ color: STATUS_ACCENTS.todo_backlog.color }}>ToDo / Backlog</span>
                  </th>
                  <th className="text-right font-semibold px-4 py-2.5 w-28">
                    <span style={{ color: STATUS_ACCENTS.in_progress.color }}>In progress</span>
                  </th>
                  <th className="text-right font-semibold px-4 py-2.5 w-28">
                    <span style={{ color: STATUS_ACCENTS.in_review.color }}>In review</span>
                  </th>
                  <th className="text-right font-semibold px-4 py-2.5 w-24">
                    <span style={{ color: STATUS_ACCENTS.done_this_week.color }}>Done</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => {
                  const isExpanded = expandedProjectId === row.project_id;
                  // Distribution bar: 4 segments sized by share of the row's
                  // total ticket count. When `rowTotal` is 0 we hide the bar
                  // rather than render an empty track — cleaner for projects
                  // with no work this week.
                  const rowTotal =
                    row.todo_backlog + row.in_progress + row.in_review + row.done_this_week;
                  const segments: { key: StatusBucket; value: number }[] = [
                    { key: 'todo_backlog', value: row.todo_backlog },
                    { key: 'in_progress', value: row.in_progress },
                    { key: 'in_review', value: row.in_review },
                    { key: 'done_this_week', value: row.done_this_week },
                  ];
                  // Numeric cell colors — full accent when there's a value,
                  // a muted "no signal" gray when the count is zero so the
                  // eye skips empty cells.
                  const cellColor = (bucket: StatusBucket, value: number) =>
                    value > 0 ? STATUS_ACCENTS[bucket].color : '#525252';
                  return (
                    <React.Fragment key={row.project_id}>
                      <tr
                        title="Click row to see tickets"
                        onClick={() => setExpandedProjectId(isExpanded ? null : row.project_id)}
                        className={`border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors ${
                          isExpanded ? 'bg-[rgba(255,255,255,0.02)]' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-[#737373] align-top">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium text-white">
                              {row.project_name}
                            </span>
                            {row.category_name && (
                              <span className="text-[10px] text-[#E0B954] bg-[rgba(224,185,84,0.08)] border border-[rgba(224,185,84,0.15)] px-1.5 py-0.5 rounded">
                                {row.category_name}
                              </span>
                            )}
                          </div>
                          {/* Per-row distribution bar — burndown-style shape
                              of the project at a glance. Hidden when the row
                              has no tickets so the table doesn't carry empty
                              bars. */}
                          {rowTotal > 0 && (
                            <div
                              className="h-1.5 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden flex max-w-[280px]"
                              title={`${rowTotal} ticket${rowTotal === 1 ? '' : 's'} across statuses`}
                            >
                              {segments.map((s) =>
                                s.value > 0 ? (
                                  <div
                                    key={s.key}
                                    className="h-full"
                                    style={{
                                      width: `${(s.value / rowTotal) * 100}%`,
                                      backgroundColor: STATUS_ACCENTS[s.key].color,
                                    }}
                                  />
                                ) : null,
                              )}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums align-top"
                          style={{ color: cellColor('todo_backlog', row.todo_backlog) }}
                        >
                          {row.todo_backlog}
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums align-top"
                          style={{ color: cellColor('in_progress', row.in_progress) }}
                        >
                          {row.in_progress}
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums align-top"
                          style={{ color: cellColor('in_review', row.in_review) }}
                        >
                          {row.in_review}
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums align-top font-medium"
                          style={{ color: cellColor('done_this_week', row.done_this_week) }}
                        >
                          {row.done_this_week}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-[rgba(255,255,255,0.04)] bg-[rgba(0,0,0,0.25)]">
                          <td colSpan={6} className="px-4 py-4">
                            <ExpandedProjectRow project={row} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* Totals footer only when more than one project is shown — for a
                  single project the per-row numbers ARE the totals, so the
                  footer would just duplicate them. */}
              {reportRows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-[rgba(224,185,84,0.2)] bg-[rgba(255,255,255,0.025)]">
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-[#a3a3a3]">
                      Total · {reportRows.length} projects
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-semibold"
                      style={{ color: STATUS_ACCENTS.todo_backlog.color }}
                    >
                      {totals.todo_backlog}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-semibold"
                      style={{ color: STATUS_ACCENTS.in_progress.color }}
                    >
                      {totals.in_progress}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-semibold"
                      style={{ color: STATUS_ACCENTS.in_review.color }}
                    >
                      {totals.in_review}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-bold"
                      style={{ color: STATUS_ACCENTS.done_this_week.color }}
                    >
                      {totals.done_this_week}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}

      {/* Cards view — the original project-card grid. Hidden when Reports is
          active so the page doesn't double-scroll. */}
      {view === 'cards' &&
        (searchedProjects.length === 0 ? (
          <Empty>
            <EmptyDescription>
              {projectSearch.trim()
                ? 'No projects match your search.'
                : categoryFilter === 'all'
                  ? 'No projects yet.'
                  : 'No projects match this category filter.'}
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[...searchedProjects]
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
              .map((project) => (
                <div
                  key={project.id}
                  className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 hover:border-[rgba(224,185,84,0.3)] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="cursor-pointer flex-1 min-w-0"
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
                      <div className="text-xs text-[#737373] mt-0.5">{project.status}</div>
                    </div>
                    {canWriteProjects && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => onEditGitHubSettings(project, e)}
                        className="text-[#737373] hover:text-white h-7 w-7 p-0 shrink-0"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Category chip. When the admin has projects-write, the
                  chip IS the edit affordance (a Select); without it, the
                  chip renders as a read-only badge with the same shape so
                  the layout stays stable across permission levels. */}
                  <div className="mb-3">
                    {canWriteProjects ? (
                      <Select
                        value={
                          project.category_id === null
                            ? UNCATEGORIZED_OPTION
                            : String(project.category_id)
                        }
                        onValueChange={(value) => {
                          const nextId = value === UNCATEGORIZED_OPTION ? null : Number(value);
                          // No-op guard — Radix Select sometimes fires onValueChange
                          // with the current value during open/close. Skip the round
                          // trip when nothing actually changed.
                          if (nextId === project.category_id) return;
                          onSetProjectCategory(project.id, nextId);
                        }}
                      >
                        <SelectTrigger
                          onClick={(e) => e.stopPropagation()}
                          className={
                            'h-7 px-2.5 text-[11px] gap-1.5 rounded-full border w-auto inline-flex ' +
                            (project.category_name
                              ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954] border-[rgba(224,185,84,0.2)] hover:bg-[rgba(224,185,84,0.18)]'
                              : 'bg-[rgba(255,255,255,0.03)] text-[#737373] border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white')
                          }
                        >
                          <Tag className="w-3 h-3" />
                          <SelectValue>{project.category_name ?? 'Uncategorized'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                          <SelectItem value={UNCATEGORIZED_OPTION} className="text-white">
                            Uncategorized
                          </SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)} className="text-white">
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span
                        className={
                          'h-7 px-2.5 text-[11px] gap-1.5 rounded-full border inline-flex items-center ' +
                          (project.category_name
                            ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954] border-[rgba(224,185,84,0.2)]'
                            : 'bg-[rgba(255,255,255,0.03)] text-[#737373] border-[rgba(255,255,255,0.05)]')
                        }
                        title="Read-only — requires projects write to change"
                      >
                        <Tag className="w-3 h-3" />
                        {project.category_name ?? 'Uncategorized'}
                      </span>
                    )}
                  </div>

                  {/* GitHub Info + Invite */}
                  {project.github_repo_url && (
                    <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Github className="w-3.5 h-3.5 text-[#737373]" />
                        <a
                          href={project.github_repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#E0B954] hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.github_repo_name || project.github_repo_url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {project.has_github_token && (
                          <span className="ml-auto text-[10px] text-[#E0B954] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Token
                          </span>
                        )}
                      </div>
                      {canWriteProjects && (
                        <Button
                          size="sm"
                          onClick={(e) => onSendGitHubInvites(project, e)}
                          disabled={invitingProjectId === project.id}
                          className="w-full h-7 text-[10px] bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                        >
                          {invitingProjectId === project.id ? (
                            <>
                              <Spinner size="xs" tone="white" className="mr-1" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="w-3 h-3 mr-1" />
                              Send GitHub Invites
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                  {!project.github_repo_url && (
                    <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-[#737373]" />
                      <span className="text-[10px] text-[#737373]">No GitHub repo configured</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4 text-xs text-[#737373]">
                    <button
                      onClick={(e) => onOpenProjectMembers(project, e)}
                      className="flex items-center gap-1 hover:text-[#E0B954] transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-[rgba(224,185,84,0.08)]"
                      title="View and manage project members"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="underline-offset-2 hover:underline">
                        {project.developer_count}
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      <Ticket className="w-3.5 h-3.5" />
                      {project.total_items}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#737373]">Progress</span>
                      <span className="text-[#a3a3a3]">{project.completion_pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#E0B954] to-[#B8872A] rounded-full"
                        style={{ width: `${project.completion_pct}%` }}
                      />
                    </div>
                  </div>
                  {/* Pulse Settings — opens this project's Pulse Settings tab in ProjectDetail */}
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/project/${project.id}?tab=pulse_settings`);
                    }}
                    className="w-full mt-3 h-8 text-[11px] bg-[rgba(224,185,84,0.1)] hover:bg-[rgba(224,185,84,0.18)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] rounded-lg font-semibold"
                  >
                    <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                    Edit Pulse values
                  </Button>
                </div>
              ))}
          </div>
        ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// ExpandedProjectRow — sub-component that owns the drill-down for one row.
//
// Encapsulated as its own component so:
//   1. The useQuery is mounted only when a row is expanded — collapsing the
//      row unmounts this and the query is garbage-collected by React Query.
//   2. The selected-status pill state is per-project; expanding a different
//      row starts cleanly on `in_progress` rather than inheriting state.
//   3. ProjectsTab stays readable without juggling per-row state in a Map.
// ─────────────────────────────────────────────────────────────────────────

interface ExpandedProjectRowProps {
  project: WeeklyReportRow;
}

const STATUS_BUTTONS: { id: StatusBucket; label: string }[] = [
  // ToDo/Backlog first — it's the earliest workflow status, so reading
  // left-to-right matches the lifecycle. `in_progress` remains the default
  // selection (set in useState below) per UX requirement.
  { id: 'todo_backlog', label: 'ToDo / Backlog' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' },
  { id: 'done_this_week', label: 'Done' },
];

const ExpandedProjectRow = ({ project }: ExpandedProjectRowProps) => {
  const [selectedStatus, setSelectedStatus] = useState<StatusBucket>('in_progress');

  const ticketsQuery = useQuery<ProjectWeeklyTickets>({
    queryKey: ['admin', 'projectsWeeklyTickets', project.project_id],
    queryFn: () =>
      apiFetch<ProjectWeeklyTickets>(`/api/admin/projects/${project.project_id}/weekly-tickets`),
    // No staleTime override — admin views are background-refetched on focus
    // by the parent's ADMIN_REFETCH defaults; per-row queries inherit those
    // when AdminDashboard's QueryClient resolves the cache.
  });

  // Per-status counts for the pill labels. Read off the parent's snapshot row
  // so the pills can show counts even before the lazy fetch resolves.
  const counts: Record<StatusBucket, number> = {
    todo_backlog: project.todo_backlog,
    in_progress: project.in_progress,
    in_review: project.in_review,
    done_this_week: project.done_this_week,
  };

  const tickets: WeeklyTicket[] = ticketsQuery.data ? ticketsQuery.data[selectedStatus] : [];

  return (
    <div className="space-y-3">
      {/* Status pill toggle — each button takes its own status accent color
          when active, matching the column headers above and the canonical
          home-page palette (blue / gold / violet / green). This gives the
          buttons a meaningful visual connection to "which status am I
          looking at right now". */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_BUTTONS.map((opt) => {
          const active = selectedStatus === opt.id;
          const accent = STATUS_ACCENTS[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedStatus(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border ${
                active
                  ? ''
                  : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
              style={
                active
                  ? {
                      backgroundColor: accent.bg,
                      color: accent.color,
                      borderColor: `${accent.color}55`,
                    }
                  : undefined
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: active ? accent.color : 'rgba(255,255,255,0.2)' }}
              />
              {opt.label}
              <span
                className="tabular-nums text-[10px] px-1.5 py-0.5 rounded"
                style={
                  active
                    ? {
                        backgroundColor: `${accent.color}26`,
                        color: accent.color,
                      }
                    : {
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        color: '#737373',
                      }
                }
              >
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ticket list for the selected status. Loading + empty states keep the
          layout stable so toggling buttons doesn't make the row jump. */}
      {ticketsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-[#737373]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading tickets…
        </div>
      ) : ticketsQuery.isError ? (
        <div className="py-3 text-xs text-[#FCA5A5]">
          Failed to load tickets. {(ticketsQuery.error as Error)?.message ?? ''}
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-3 text-xs text-[#737373]">
          {selectedStatus === 'done_this_week'
            ? 'Nothing completed this week.'
            : selectedStatus === 'todo_backlog'
              ? 'No tickets in todo or backlog.'
              : `No tickets ${selectedStatus === 'in_progress' ? 'in progress' : 'in review'}.`}
        </div>
      ) : (
        // Ticket rows as "chip cards" rather than a flat divided list.
        // Each row anchors the type (colored icon tile) and key on the left,
        // truncatable title in the middle, then assignee + hours on the
        // right. The hours mini-bar gives an at-a-glance progress read
        // without sacrificing the numeric breakdown.
        <ul className="space-y-1.5">
          {tickets.map((t) => {
            const typeConfig = TASK_TYPE_CONFIG[t.type] || TASK_TYPE_CONFIG.task;
            const TypeIcon = typeConfig.icon;
            const priorityColor =
              PRIORITY_COLOR[t.priority?.toLowerCase?.()] || PRIORITY_COLOR.medium;
            const logged = t.logged_hours ?? 0;
            const estimated = t.estimated_hours ?? 0;
            const progress = estimated > 0 ? Math.min(100, (logged / estimated) * 100) : 0;
            const isComplete = estimated > 0 && logged >= estimated;
            return (
              <li key={t.id}>
                <a
                  href={`/project/${project.project_id}/board/${t.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 px-3 py-2.5 bg-[rgba(255,255,255,0.025)] hover:bg-[rgba(255,255,255,0.045)] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(224,185,84,0.25)] rounded-lg transition-colors"
                  title="Open ticket in new tab"
                >
                  {/* Type icon tile */}
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: typeConfig.bg }}
                    title={typeConfig.label}
                  >
                    <TypeIcon className="w-3.5 h-3.5" style={{ color: typeConfig.color }} />
                  </div>
                  {/* Key */}
                  {t.key && (
                    <span className="font-mono text-[11px] font-semibold text-[#E0B954] tabular-nums shrink-0">
                      {t.key}
                    </span>
                  )}
                  {/* Priority dot — small but legible (P at-a-glance) */}
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: priorityColor }}
                    title={`${t.priority} priority`}
                  />
                  {/* Title */}
                  <span className="text-sm text-white flex-1 min-w-0 truncate group-hover:text-[#fff8ec] transition-colors">
                    {t.title}
                  </span>
                  {/* Assignee — avatar + name to match the visual treatment
                      used in MyCapacityCard / the kanban side panel */}
                  {t.assignee_name && (
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      title={`Assignee: ${t.assignee_name}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-white">
                          {t.assignee_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs text-[#a3a3a3] max-w-[110px] truncate">
                        {t.assignee_name}
                      </span>
                    </div>
                  )}
                  {/* Hours + progress */}
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs">
                      <span className="text-white font-medium">{logged}h</span>
                      <span className="text-[#525252]"> / {estimated}h</span>
                    </div>
                    {estimated > 0 && (
                      <div className="h-0.5 w-16 mt-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden ml-auto">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: isComplete ? '#34D399' : '#E0B954',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ProjectsTab;
export type { Project };
