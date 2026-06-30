import { CalendarRange, Loader2, TableProperties, ChevronDown, ChevronRight } from 'lucide-react';
import React from 'react';
import type { ProjectWeeklyReportRow } from '@/client';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import ExpandedProjectRow from './ExpandedProjectRow';
import { STATUS_ACCENTS } from './types';
import type { StatusBucket } from './types';

interface ReportTotals {
  todo_backlog: number;
  in_progress: number;
  in_review: number;
  done_this_week: number;
}

interface ProjectReportsViewProps {
  reportRows: ProjectWeeklyReportRow[];
  reportRange: string;
  totals: ReportTotals;
  weeklyReportLoading: boolean;
  projectSearch: string;
  expandedProjectId: number | null;
  onToggleExpand: (projectId: number) => void;
}

/** Per-project weekly table with expandable rows. Each row reveals 3 status
 *  pills + a ticket list on click, replicating the EmployeesTab capacity
 *  drill-down pattern. */
const ProjectReportsView: React.FC<ProjectReportsViewProps> = ({
  reportRows,
  reportRange,
  totals,
  weeklyReportLoading,
  projectSearch,
  expandedProjectId,
  onToggleExpand,
}) => {
  return (
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
            <span className="text-[#a3a3a3] font-medium">Done</span> shows tickets marked done this
            week. The other columns are current-state snapshots across the project.
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
                    onClick={() => onToggleExpand(row.project_id)}
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
                        <span className="text-sm font-medium text-white">{row.project_name}</span>
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
  );
};

export default ProjectReportsView;
