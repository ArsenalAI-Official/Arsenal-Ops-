import { BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import type { SprintResponse } from '@/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { HoursAnalytics } from '../types';

interface SprintOverviewProps {
  sprints: SprintResponse[];
  analytics: HoursAnalytics;
  progressExpanded: boolean;
  setProgressExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function SprintOverview({
  sprints,
  analytics,
  progressExpanded,
  setProgressExpanded,
}: SprintOverviewProps) {
  return (
    <Card className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.12)] rounded-2xl p-5">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-white">Sprint Overview</CardTitle>
            <p className="text-xs text-[#737373]">Progress, hours breakdown, and delivery status</p>
          </div>
        </div>
        {sprints.length > 1 && (
          <button
            onClick={() => setProgressExpanded((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] transition-colors font-medium flex-shrink-0"
          >
            {progressExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show Active Only
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Show all {sprints.length}
              </>
            )}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {sprints.length === 0 ? (
          <div className="text-center py-8 text-[#737373]">
            <p>No sprints created yet. Create a sprint to start tracking progress and hours.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {(progressExpanded ? sprints : sprints.filter((s) => s.status === 'active')).map(
              (sprint) => {
                // Get the corresponding sprint data from analytics
                const sprintAnalytics = analytics.sprint_hours.find(
                  (sh) => sh.sprint_id === sprint.id,
                );

                // Calculate expected progress based on time elapsed
                const now = new Date();
                let expectedPct = 0;
                if (sprint.start_date && sprint.end_date) {
                  const start = new Date(sprint.start_date);
                  const end = new Date(sprint.end_date);
                  const totalMs = end.getTime() - start.getTime();
                  const elapsedMs = Math.min(now.getTime() - start.getTime(), totalMs);
                  expectedPct =
                    totalMs > 0 ? Math.max(0, Math.round((elapsedMs / totalMs) * 100)) : 0;
                  if (sprint.status === 'completed') expectedPct = 100;
                  if (now < start) expectedPct = 0;
                }
                const actual = sprint.completion_pct;
                const delta = actual - expectedPct;
                const isAhead = delta >= 0;
                const isFar = Math.abs(delta) > 15;

                // Use analytics data for hours, fallback to sprint data
                const allocatedHours =
                  sprintAnalytics?.allocated_hours ?? sprint.capacity_hours ?? 0;
                const loggedHours = sprintAnalytics?.logged_hours ?? sprint.velocity ?? 0;
                // Remaining = Allocated − Logged, unclamped: an over-logged sprint
                // surfaces as a negative (audit #13). The fallback must NOT floor at
                // 0, or the same over-budget sprint would read -12h with analytics
                // and 0h without — two displays of one state.
                const remainingHours =
                  sprintAnalytics?.remaining_hours ?? allocatedHours - loggedHours;

                return (
                  <div
                    key={sprint.id}
                    className={`border rounded-xl p-5 transition-colors ${
                      sprint.status === 'completed'
                        ? 'border-status-done/20 bg-status-done/5'
                        : isFar && !isAhead
                          ? 'border-[#EF4444]/20 bg-[rgba(239,68,68,0.03)]'
                          : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                    }`}
                  >
                    {/* Header: Sprint Name, Status, Delta */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              sprint.status === 'active'
                                ? 'bg-status-in-progress animate-pulse'
                                : sprint.status === 'completed'
                                  ? 'bg-status-done'
                                  : 'bg-[#737373]'
                            }`}
                          />
                          <p className="text-base font-bold text-white">{sprint.name}</p>
                          <Badge
                            className={`text-[10px] border-0 ml-1 ${
                              sprint.status === 'active'
                                ? 'bg-status-in-progress/20 text-status-in-progress'
                                : sprint.status === 'completed'
                                  ? 'bg-status-done/20 text-status-done'
                                  : 'bg-[#737373]/20 text-[#737373]'
                            }`}
                          >
                            {sprint.status}
                          </Badge>
                        </div>
                        {/* Date Range */}
                        {sprint.start_date && sprint.end_date && (
                          <p className="text-xs text-[#737373]">
                            📅{' '}
                            {new Date(sprint.start_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            –{' '}
                            {new Date(sprint.end_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-lg whitespace-nowrap ml-4 flex-shrink-0 ${
                          isAhead
                            ? 'bg-status-done/15 text-status-done'
                            : isFar
                              ? 'bg-[#EF4444]/15 text-[#EF4444]'
                              : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                        }`}
                      >
                        {isAhead ? '↗' : '↙'} {Math.abs(delta)}%
                      </span>
                    </div>

                    {sprint.goal && (
                      <p className="text-xs text-[#a3a3a3] mb-4 italic line-clamp-2">
                        \"{sprint.goal}\"
                      </p>
                    )}

                    {/* Sprint Progress Section */}
                    <div className="mb-5 pb-5 border-b border-[rgba(255,255,255,0.05)]">
                      <h4 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3">
                        Progress Tracking
                      </h4>
                      <div className="space-y-3">
                        {/* Actual Progress */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-white">Completion</span>
                            <span className="text-sm font-bold text-muted-foreground">
                              {actual}%
                            </span>
                          </div>
                          <div className="h-2.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-progress rounded-full transition-all duration-500"
                              style={{ width: `${actual}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Hours Breakdown Section */}
                    <div className="mb-5 pb-5 border-b border-[rgba(255,255,255,0.05)]">
                      <h4 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3">
                        Hours Breakdown
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        {/* Total Allocated Hours */}
                        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3">
                          <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                            Total Allocated
                          </div>
                          <div className="text-lg font-bold text-white">{allocatedHours}h</div>
                          <p className="text-[9px] text-[#737373] mt-1">
                            Based on {sprint.total_items} tickets
                          </p>
                        </div>
                        {/* Logged Hours */}
                        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3 border-l-2 border-l-[rgba(255,255,255,0.12)]">
                          <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                            Logged Hours
                          </div>
                          <div className="text-lg font-bold text-muted-foreground">
                            {loggedHours}h
                          </div>
                          <p className="text-[9px] text-[#737373] mt-1">Hours tracked</p>
                        </div>
                        {/* Remaining Hours */}
                        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3">
                          <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                            Remaining Hours
                          </div>
                          <div className="text-lg font-bold text-[#F59E0B]">{remainingHours}h</div>
                          <p className="text-[9px] text-[#737373] mt-1">Not yet logged</p>
                        </div>
                      </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="py-2">
                        <div className="text-sm font-bold text-white">
                          {sprint.done_count}/{sprint.total_items}
                        </div>
                        <div className="text-[10px] text-[#737373]">Items Completed</div>
                      </div>
                      <div className="py-2 border-l border-r border-[rgba(255,255,255,0.05)]">
                        <div className="text-sm font-bold text-muted-foreground">
                          {sprint.completed_points}/{sprint.total_points}
                        </div>
                        <div className="text-[10px] text-[#737373]">Story Points</div>
                      </div>
                      <div className="py-2">
                        <div className="text-sm font-bold text-white">{actual}%</div>
                        <div className="text-[10px] text-[#737373]">Overall Progress</div>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
