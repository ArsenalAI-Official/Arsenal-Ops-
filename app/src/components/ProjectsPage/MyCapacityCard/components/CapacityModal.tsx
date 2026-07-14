import { Activity, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MyCapacityResponse, ProjectGroup } from '../types';
import { WEEKLY_CAPACITY, projectColor, statusBadgeColor } from '../types';
import ReviewSubmitView from './ReviewSubmitView';

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

type ModalView = 'summary' | 'review';

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
  // View switcher: Summary (current capacity overview) ↔ Review (the new
  // dev Submit & Sync flow). Reset to summary on close so a stale review
  // view doesn't surface from the previous open — done in the open
  // change handler (not a setState-in-effect, which the React 19 hooks
  // rules disallow).
  const [view, setView] = useState<ModalView>('summary');
  // Lifted from ReviewSubmitView so we can lock the dialog while the
  // QuickBooks submit/sync is mid-flight. Closing mid-sync risks the
  // dev not seeing the success/partial-failure banner, and (worse) a
  // partial failure becoming invisible to them.
  const [isSyncing, setIsSyncing] = useState(false);

  const handleOpenChange = (next: boolean) => {
    // Block close while the submit/sync mutation is running. The
    // Syncing… spinner on the Submit button is the user's signal that
    // something's in flight; they get the dialog back automatically
    // when the mutation resolves.
    if (!next && isSyncing) return;
    if (!next) setView('summary');
    onOpenChange(next);
  };

  // Mon-Fri of the current calendar week, derived locally so the
  // Review view's header matches what the dev sees in the day cards
  // below. The Summary view continues to display the backend's
  // Sat→Fri capacity window (`data.week_start`/`week_end`) because
  // capacity rolls up across the full Sat-Fri pulse week.
  const reviewWeek = (() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysBackToMonday = (dow + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysBackToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return { monday, friday };
  })();
  const fmtMd = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtMdy = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-[#0d0d0d] border-[rgba(255,255,255,0.07)] w-[92vw] max-w-[900px] sm:max-w-[900px] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden"
        // Hide the close X while syncing AND block the Radix-default
        // outside-click + Escape paths so the user can't dismiss the
        // dialog mid-sync no matter how they try.
        showCloseButton={!isSyncing}
        onPointerDownOutside={(e) => {
          if (isSyncing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isSyncing) e.preventDefault();
        }}
      >
        <DialogHeader className="pb-2 shrink-0">
          <DialogTitle className="text-white flex items-center gap-2.5 text-lg">
            <Activity className="w-5 h-5 text-[#E0B954]" />
            {view === 'review' ? 'Review & Submit Hours' : 'My Capacity This Week'}
          </DialogTitle>
          {view === 'review' ? (
            <p className="text-xs text-[#737373] font-normal mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[#a3a3a3]">
                {fmtMd(reviewWeek.monday)}
                {' → '}
                {fmtMdy(reviewWeek.friday)}
              </span>
              <span className="text-[rgba(255,255,255,0.15)]">·</span>
              <span>Mon → Fri</span>
            </p>
          ) : (
            data && (
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
            )
          )}
        </DialogHeader>

        {view === 'review' && (
          <ReviewSubmitView onBack={() => setView('summary')} onSyncingChange={setIsSyncing} />
        )}

        {view === 'summary' && data && (
          <div className="flex flex-col flex-1 min-h-0 gap-6 mt-4">
            {/* Hero — two tiles side by side. Capacity tile owns the
                stacked-bar + project legend so the chips visually anchor
                to the bar they describe. Logged tile is a single big
                number for the at-a-glance "did I clock anything this
                week" read. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
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
                  <span className="text-4xl font-bold text-[#E0B954] tracking-tight tabular-nums">
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
                each card owns the full dialog width. The hero tiles and
                footer button stay pinned; only this list scrolls when
                the project count exceeds the dialog height. */}
            {projectsByHours.length > 0 ? (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold mb-3 shrink-0">
                  Breakdown by Project
                </h3>
                <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
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
                                    <span className="text-[11px] font-mono text-[#E0B954] tabular-nums shrink-0">
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

            {/* Footer — gateway to the Review & Submit view. Pinned at
                the bottom of the dialog (shrink-0) so it stays visible
                as the project list scrolls above it. */}
            <div className="flex justify-end pt-2 border-t border-[rgba(255,255,255,0.05)] shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setView('review')}
                className="bg-[rgba(224,185,84,0.08)] border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.16)] hover:text-[#E0B954]"
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Review &amp; Submit Hours
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CapacityModal;
