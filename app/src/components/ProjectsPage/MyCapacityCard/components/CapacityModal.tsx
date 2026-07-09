import { Activity } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MyCapacityResponse, ProjectGroup } from '../types';
import { WEEKLY_CAPACITY, projectColor, statusBadgeColor } from '../types';

interface CapacityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MyCapacityResponse | undefined;
  used: number;
  status: 'Available' | 'Moderate' | 'Busy';
  statusColor: string;
  totalLoggedThisWeek: number;
  projectsByHours: ProjectGroup[];
}

const CapacityModal = ({
  open,
  onOpenChange,
  data,
  used,
  status,
  statusColor,
  totalLoggedThisWeek,
  projectsByHours,
}: CapacityModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.07)] max-w-[95vw] max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-white flex items-center gap-2.5 text-lg">
            <Activity className="w-5 h-5 text-muted-foreground" />
            My Capacity This Week
          </DialogTitle>
          {data && (
            <p className="text-xs text-[#737373] font-normal mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[#a3a3a3]">
                {new Date(data.week_start).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {' → '}
                {new Date(data.week_end).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <span className="text-[rgba(255,255,255,0.15)]">·</span>
              <span>Sat → Fri, UTC</span>
            </p>
          )}
        </DialogHeader>

        {data && (
          <div className="space-y-6 mt-4">
            {/* Hero — two tiles side by side. Capacity tile owns the
                stacked-bar + project legend so the chips visually anchor
                to the bar they describe. Logged tile is a single big
                number for the at-a-glance "did I clock anything this
                week" read. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Capacity used */}
              <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">
                    Capacity used
                  </p>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: `${statusColor}1a`,
                      color: statusColor,
                      borderColor: `${statusColor}55`,
                    }}
                  >
                    {status}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span
                    className="text-4xl font-bold tracking-tight tabular-nums"
                    style={{ color: statusColor }}
                  >
                    {used}h
                  </span>
                  <span className="text-sm text-[#737373]">/ {WEEKLY_CAPACITY}h</span>
                  <span className="text-xs text-[#525252] ml-auto tabular-nums">
                    {Math.round((used / WEEKLY_CAPACITY) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
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
                {projectsByHours.length > 0 && (
                  <div className="text-[11px] text-[#737373] mt-3 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
                    {projectsByHours.map((p) => (
                      <span key={p.projectId} className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: projectColor(p.projectId) }}
                        />
                        <span className="truncate max-w-[200px]" title={p.projectName}>
                          {p.projectName}
                        </span>
                        <span className="text-[#525252] tabular-nums">{p.total}h</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Logged this week */}
              <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold mb-3">
                  Logged this week
                </p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-bold text-muted-foreground tracking-tight tabular-nums">
                    {totalLoggedThisWeek}h
                  </span>
                  <span className="text-xs text-[#737373]">
                    across {projectsByHours.length} project
                    {projectsByHours.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-[#525252] mt-2">
                  Total hours you clocked from Saturday through Friday — independent of capacity
                  allocation.
                </p>
              </div>
            </div>

            {/* Breakdown — one card per project, stacked vertically so
                each card owns the full dialog width. Wide cards mean
                ticket rows can show key + status, title, and metadata
                without truncation; the counted-hours stamp pins to the
                right edge and stays visually anchored. */}
            {projectsByHours.length > 0 ? (
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold mb-3">
                  Breakdown by Project
                </h3>
                <div className="space-y-4">
                  {projectsByHours.map((p) => {
                    const color = projectColor(p.projectId);
                    const sortedTickets = [...p.tickets].sort(
                      (a, b) => b.counted_hours - a.counted_hours,
                    );
                    return (
                      <div
                        key={p.projectId}
                        className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4"
                      >
                        {/* Project header */}
                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span
                              className="text-sm font-semibold text-white truncate"
                              title={p.projectName}
                            >
                              {p.projectName}
                            </span>
                            <span className="text-[10px] text-[#a3a3a3] shrink-0 px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] tabular-nums">
                              {p.tickets.length} ticket{p.tickets.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <span
                            className="text-base font-mono font-semibold tabular-nums shrink-0"
                            style={{ color }}
                          >
                            {p.total}h
                          </span>
                        </div>
                        {/* Tickets */}
                        <ul className="space-y-3">
                          {sortedTickets.map((t) => {
                            const sColor = statusBadgeColor(t.status);
                            return (
                              <li key={t.id} className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0">
                                      {t.key}
                                    </span>
                                    <span
                                      className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0"
                                      style={{
                                        backgroundColor: `${sColor}22`,
                                        color: sColor,
                                      }}
                                    >
                                      {t.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <div
                                    className="text-xs text-white leading-snug mb-1.5"
                                    title={t.title}
                                  >
                                    {t.title}
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-[#737373] tabular-nums">
                                    <span>
                                      est{' '}
                                      <span className="text-[#a3a3a3]">{t.estimated_hours}h</span>
                                    </span>
                                    <span className="text-[rgba(255,255,255,0.1)]">·</span>
                                    <span>
                                      logged{' '}
                                      <span className="text-[#a3a3a3]">{t.logged_hours}h</span>
                                    </span>
                                    <span className="text-[rgba(255,255,255,0.1)]">·</span>
                                    <span>
                                      remaining{' '}
                                      <span className="text-[#a3a3a3]">{t.remaining_hours}h</span>
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className="text-sm font-mono font-semibold tabular-nums shrink-0 mt-0.5"
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
              </div>
            ) : (
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-10 text-center">
                <Activity className="w-8 h-8 text-[#525252] mx-auto mb-2.5" />
                <p className="text-sm text-[#a3a3a3] font-medium">Nothing scheduled this week</p>
                <p className="text-xs text-[#525252] mt-1">
                  You're all clear — assign yourself work to fill up your capacity.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CapacityModal;
