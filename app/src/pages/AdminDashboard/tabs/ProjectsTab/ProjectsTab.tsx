import React, { useMemo, useState } from 'react';
import type { ProjectCategory } from '../../modals/CategoryManagerModal';
import ProjectsToolbar from './ProjectsToolbar';
import ProjectsViewToggle from './ProjectsViewToggle';
import ProjectReportsView from './ProjectReportsView';
import ProjectCardsView from './ProjectCardsView';
import { formatWeekRange } from './types';
import type { Project, ProjectsView, WeeklyReport } from './types';

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
  // Sub-view toggle inside the tab. 'cards' (default) shows the existing
  // project-card grid. 'reports' shows the per-project weekly table with
  // expandable rows. Filter + manage-categories controls in the tab header
  // apply to both views.
  const [view, setView] = useState<ProjectsView>('cards');

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
      {/* Header — title + search + category filter + manage-categories button */}
      <ProjectsToolbar
        projectSearch={projectSearch}
        onProjectSearchChange={setProjectSearch}
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={onCategoryFilterChange}
        onClearFilters={() => {
          setProjectSearch('');
          onCategoryFilterChange('all');
        }}
        searchedCount={searchedProjects.length}
        totalCount={projects.length}
        onOpenCategoryManager={onOpenCategoryManager}
        canWriteProjects={canWriteProjects}
      />

      {/* Sub-view toggle: Cards (default) | Reports. */}
      <ProjectsViewToggle
        view={view}
        onViewChange={(next) => {
          setView(next);
          // Collapse any expanded row when leaving Reports so a return
          // visit starts fresh.
          if (next !== 'reports') setExpandedProjectId(null);
        }}
      />

      {/* Reports view — per-project weekly table with expandable rows. */}
      {view === 'reports' && (
        <ProjectReportsView
          reportRows={reportRows}
          reportRange={reportRange}
          totals={totals}
          weeklyReportLoading={weeklyReportLoading}
          projectSearch={projectSearch}
          expandedProjectId={expandedProjectId}
          onToggleExpand={(projectId) =>
            setExpandedProjectId((prev) => (prev === projectId ? null : projectId))
          }
        />
      )}

      {/* Cards view — the original project-card grid. */}
      {view === 'cards' && (
        <ProjectCardsView
          searchedProjects={searchedProjects}
          projectSearch={projectSearch}
          categoryFilter={categoryFilter}
          categories={categories}
          invitingProjectId={invitingProjectId}
          onSetProjectCategory={onSetProjectCategory}
          onEditGitHubSettings={onEditGitHubSettings}
          onSendGitHubInvites={onSendGitHubInvites}
          onOpenProjectMembers={onOpenProjectMembers}
          canWriteProjects={canWriteProjects}
        />
      )}
    </div>
  );
};

export default ProjectsTab;
export type { Project, WeeklyReport, WeeklyReportRow } from './types';
