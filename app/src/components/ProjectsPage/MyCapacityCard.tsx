import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  counted_hours: number;
  counted_basis: string;
  your_logged_this_week: number;
}

interface MyCapacityResponse {
  developer_id: number;
  developer_name: string;
  week_start: string;
  week_end: string;
  this_week_in_progress_hours: number;
  this_week_in_review_hours: number;
  this_week_done_hours: number;
  this_week_capacity_used: number;
  this_week_remaining_capacity: number;
  tickets: CapacityTicket[];
}

const WEEKLY_CAPACITY = 40;

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

/**
 * Compact dashboard tile showing the logged-in user's weekly capacity.
 * Click opens a modal with the full project + ticket breakdown — same shape
 * as a row in the admin Employees tab.
 */
const MyCapacityCard = () => {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<MyCapacityResponse>({
    queryKey: ['myCapacity'],
    queryFn: () => apiFetch('/api/developers/me/capacity'),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  // Hide silently for users with no developer profile.
  if (error instanceof ApiError && error.status === 404) return null;

  const used = data?.this_week_capacity_used ?? 0;
  const remaining = data?.this_week_remaining_capacity ?? WEEKLY_CAPACITY;
  const status: 'Available' | 'Moderate' | 'Busy' =
    remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
  const statusColor =
    status === 'Available' ? '#34D399' : status === 'Moderate' ? '#F59E0B' : '#EF4444';

  // Total hours I actually logged this week across every project.
  const totalLoggedThisWeek = (data?.tickets ?? []).reduce(
    (s, t) => s + (t.your_logged_this_week ?? 0),
    0,
  );

  // Group contributing tickets by project for the modal detail view.
  const projectGroupsMap = (data?.tickets ?? []).reduce<
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
    if (!acc[pid]) {
      acc[pid] = {
        projectId: pid,
        projectName: t.project_name || `Project ${pid}`,
        tickets: [],
        total: 0,
      };
    }
    acc[pid].tickets.push(t);
    acc[pid].total += t.counted_hours;
    return acc;
  }, {});
  const projectsByHours = Object.values(projectGroupsMap).sort((a, b) => b.total - a.total);

  return (
    <>
      <button
        type="button"
        onClick={() => !isLoading && data && setOpen(true)}
        disabled={isLoading || !data}
        className="flex-1 text-left bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-colors disabled:cursor-default disabled:hover:border-[rgba(255,255,255,0.05)] disabled:hover:bg-[rgba(255,255,255,0.025)]"
      >
        <div className="mb-3">
          <Activity className="w-4 h-4" style={{ color: statusColor }} />
        </div>
        {isLoading ? (
          <div className="h-8 w-16 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
        ) : (
          <>
            <div className="text-3xl font-bold tracking-tight" style={{ color: statusColor }}>
              {used}h
              <span className="text-base text-[#737373] font-normal"> / {WEEKLY_CAPACITY}h</span>
            </div>
            <div className="text-[11px] text-[#E0B954] font-medium mt-0.5">
              {totalLoggedThisWeek}h logged this week
            </div>
          </>
        )}
        <div className="text-xs text-[#737373] font-medium mt-1">Capacity this week</div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.07)] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E0B954]" />
              My Capacity This Week
            </DialogTitle>
            {data && (
              <p className="text-xs text-[#737373] font-normal">
                <span className="font-mono">
                  {new Date(data.week_start).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' → '}
                  {new Date(data.week_end).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="ml-2">(Sat → Fri, UTC)</span>
              </p>
            )}
          </DialogHeader>

          {data && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span
                  className="text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md border"
                  style={{
                    backgroundColor: `${statusColor}22`,
                    color: statusColor,
                    borderColor: `${statusColor}55`,
                  }}
                >
                  {status} · {used}h / {WEEKLY_CAPACITY}h (
                  {Math.round((used / WEEKLY_CAPACITY) * 100)}%)
                </span>
                <span className="text-xs text-[#E0B954] font-medium">
                  {totalLoggedThisWeek}h logged this week
                </span>
              </div>

              <div>
                <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                  {projectsByHours.map((p) => (
                    <div
                      key={p.projectId}
                      className="h-full"
                      style={{
                        width: `${Math.min(100, (p.total / WEEKLY_CAPACITY) * 100)}%`,
                        backgroundColor: projectColor(p.projectId),
                      }}
                      title={`${p.projectName}: ${p.total}h`}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-2 flex-wrap">
                  {projectsByHours.length === 0 ? (
                    <span>No tickets contributing this week.</span>
                  ) : (
                    projectsByHours.map((p, i) => (
                      <span key={p.projectId} className="flex items-center gap-1">
                        {i > 0 && <span className="text-[rgba(255,255,255,0.15)]">·</span>}
                        <span
                          className="w-1.5 h-1.5 rounded-sm"
                          style={{ backgroundColor: projectColor(p.projectId) }}
                        />
                        <span className="truncate max-w-[160px]" title={p.projectName}>
                          {p.projectName}
                        </span>
                        <span>· {p.total}h</span>
                      </span>
                    ))
                  )}
                </div>
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
                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                    <span>logged {t.logged_hours}h</span>
                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                    <span>remaining {t.remaining_hours}h</span>
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MyCapacityCard;
