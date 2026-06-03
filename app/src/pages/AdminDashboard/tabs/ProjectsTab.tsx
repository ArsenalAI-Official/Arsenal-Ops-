import React, { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
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
}: ProjectsTabProps) => {
  const navigate = useNavigate();

  // Sub-view toggle inside the tab. 'cards' (default) shows the existing
  // project-card grid. 'reports' shows the per-project weekly table with
  // expandable rows. Filter + manage-categories controls in the tab header
  // apply to both views.
  const [view, setView] = useState<'cards' | 'reports'>('cards');

  // Which row in the reports table is expanded — null when none. Reset to
  // null whenever the user switches back to 'cards' so re-entering 'reports'
  // starts collapsed.
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);

  const reportRows = weeklyReport?.rows ?? [];
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
          {/* Match "Back to Projects" button style — ghost variant, muted
              foreground that brightens on hover. Keeps the header visual
              hierarchy consistent across the admin shell. */}
          <Button
            variant="ghost"
            onClick={onOpenCategoryManager}
            className="text-[#737373] hover:text-white"
          >
            <Tag className="w-4 h-4 mr-2" />
            Manage categories
          </Button>
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
          {/* Legend — replaces the old "Weekly report" header. Clarifies that
              only the Done column is week-windowed; the other columns are
              current-state snapshots across the entire project. */}
          {reportRows.length > 0 && (
            <div className="px-4 py-2.5 border-b border-[rgba(255,255,255,0.05)] flex items-center gap-2 text-xs text-[#737373]">
              <CalendarRange className="w-3.5 h-3.5 text-[#E0B954] shrink-0" />
              <span>
                <span className="text-[#a3a3a3]">Done</span> shows tickets marked done this week
                {reportRange && <span className="text-[#525252]"> · {reportRange}</span>}
              </span>
              {weeklyReportLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#737373] ml-auto" />
              )}
            </div>
          )}

          {weeklyReportLoading && reportRows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#737373]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading report…
            </div>
          ) : reportRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#737373]">
              No report data for the current filter.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#737373] bg-[rgba(255,255,255,0.02)]">
                  <th className="text-left font-medium px-4 py-2 w-8"></th>
                  <th className="text-left font-medium px-4 py-2">Project</th>
                  <th className="text-right font-medium px-4 py-2 w-32">ToDo / Backlog</th>
                  <th className="text-right font-medium px-4 py-2 w-28">In progress</th>
                  <th className="text-right font-medium px-4 py-2 w-28">In review</th>
                  <th className="text-right font-medium px-4 py-2 w-24">Done</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => {
                  const isExpanded = expandedProjectId === row.project_id;
                  return (
                    <React.Fragment key={row.project_id}>
                      <tr
                        title="Click row to see tickets"
                        onClick={() => setExpandedProjectId(isExpanded ? null : row.project_id)}
                        className={`border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer ${
                          isExpanded ? 'bg-[rgba(255,255,255,0.015)]' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-[#737373]">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-2 text-white">
                          <div className="flex items-center gap-2">
                            <span>{row.project_name}</span>
                            {row.category_name && (
                              <span className="text-[10px] text-[#E0B954] bg-[rgba(224,185,84,0.08)] px-1.5 py-0.5 rounded">
                                {row.category_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-[#a3a3a3] tabular-nums">
                          {row.todo_backlog}
                        </td>
                        <td className="px-4 py-2 text-right text-[#a3a3a3] tabular-nums">
                          {row.in_progress}
                        </td>
                        <td className="px-4 py-2 text-right text-[#a3a3a3] tabular-nums">
                          {row.in_review}
                        </td>
                        <td className="px-4 py-2 text-right text-[#E0B954] tabular-nums font-medium">
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
                  <tr className="border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-2"></td>
                    <td className="px-4 py-2 text-xs font-medium text-[#737373]">Total</td>
                    <td className="px-4 py-2 text-right text-white tabular-nums font-medium">
                      {totals.todo_backlog}
                    </td>
                    <td className="px-4 py-2 text-right text-white tabular-nums font-medium">
                      {totals.in_progress}
                    </td>
                    <td className="px-4 py-2 text-right text-white tabular-nums font-medium">
                      {totals.in_review}
                    </td>
                    <td className="px-4 py-2 text-right text-[#E0B954] tabular-nums font-semibold">
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
        (projects.length === 0 ? (
          <div className="border border-dashed border-[rgba(255,255,255,0.08)] rounded-xl p-10 text-center text-sm text-[#737373]">
            {categoryFilter === 'all'
              ? 'No projects yet.'
              : 'No projects match this category filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {projects.map((project) => (
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => onEditGitHubSettings(project, e)}
                    className="text-[#737373] hover:text-white h-7 w-7 p-0 shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Category badge IS the edit affordance — clicking it opens
                  the Select dropdown so a single chip-shaped element shows
                  the current state and lets the admin change it without a
                  separate control next to the badge. Trigger styling adapts
                  based on whether a category is assigned (gold tones) or
                  not (muted tones). */}
                <div className="mb-3">
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
                    <Button
                      size="sm"
                      onClick={(e) => onSendGitHubInvites(project, e)}
                      disabled={invitingProjectId === project.id}
                      className="w-full h-7 text-[10px] bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                    >
                      {invitingProjectId === project.id ? (
                        <>
                          <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin mr-1" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-3 h-3 mr-1" />
                          Send GitHub Invites
                        </>
                      )}
                    </Button>
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
      {/* Status pill toggle — Active uses the gold-tinted treatment from
          EmployeesTab's expanded-row view toggle so the visual vocabulary
          is consistent across admin drill-downs. */}
      <div className="flex items-center gap-2">
        {STATUS_BUTTONS.map((opt) => {
          const active = selectedStatus === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedStatus(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                active
                  ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                  : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
            >
              {opt.label}
              <span
                className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded ${
                  active
                    ? 'bg-[#E0B954]/15 text-[#E0B954]'
                    : 'bg-[rgba(255,255,255,0.04)] text-[#737373]'
                }`}
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
        <ul className="divide-y divide-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.05)] rounded-lg overflow-hidden">
          {tickets.map((t) => (
            // Each ticket row is rendered as a real <a> so middle-click and
            // Cmd/Ctrl+click open in a new tab natively. `target="_blank"`
            // covers the plain-left-click case. The <li> just provides list
            // semantics — the click area belongs to the anchor.
            <li key={t.id}>
              <a
                href={`/project/${project.project_id}/board/${t.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2.5 hover:bg-[rgba(255,255,255,0.02)] flex items-center gap-3 text-sm"
                title="Open ticket in new tab"
              >
                {t.key && (
                  <span className="font-mono text-xs text-[#737373] shrink-0 w-20 truncate">
                    {t.key}
                  </span>
                )}
                <span className="text-white flex-1 min-w-0 truncate">{t.title}</span>
                {t.assignee_name && (
                  <span className="text-[#a3a3a3] shrink-0 max-w-[140px] truncate">
                    {t.assignee_name}
                  </span>
                )}
                <span className="text-[#737373] tabular-nums shrink-0 w-20 text-right">
                  {t.logged_hours ?? 0}h
                  <span className="text-[#525252]">/{t.estimated_hours ?? 0}h</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProjectsTab;
export type { Project };
