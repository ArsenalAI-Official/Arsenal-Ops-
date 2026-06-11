import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { TASK_TYPE_CONFIG } from '@/components/ProjectsPage/constants';
import { PRIORITY_COLOR, STATUS_ACCENTS, STATUS_BUTTONS } from './types';
import type { ProjectWeeklyTickets, StatusBucket, WeeklyReportRow, WeeklyTicket } from './types';

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

export default ExpandedProjectRow;
