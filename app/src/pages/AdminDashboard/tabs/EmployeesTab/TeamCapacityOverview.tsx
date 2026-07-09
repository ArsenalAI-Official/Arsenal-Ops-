import { TrendingUp } from 'lucide-react';
import { CAPACITY_STATUS_COLOR } from './types';
import type { EmployeeStatusFilter, TeamCapacity } from './types';

interface TeamCapacityOverviewProps {
  teamCapacity: TeamCapacity;
  employeeStatusFilter: EmployeeStatusFilter;
  onStatusFilterChange: (value: EmployeeStatusFilter) => void;
}

/** Team Capacity Overview card — KPI tiles, status-filter pills, and the
 *  team-wide workload split bar. Rendered only when there are employees. */
const TeamCapacityOverview: React.FC<TeamCapacityOverviewProps> = ({
  teamCapacity,
  employeeStatusFilter,
  onStatusFilterChange,
}) => {
  return (
    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
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
                base: `rgba(${CAPACITY_STATUS_COLOR.Available.rgb}`,
                text: CAPACITY_STATUS_COLOR.Available.text,
              },
              {
                key: 'Moderate',
                count: teamCapacity.counts.Moderate,
                base: `rgba(${CAPACITY_STATUS_COLOR.Moderate.rgb}`,
                text: CAPACITY_STATUS_COLOR.Moderate.text,
              },
              {
                key: 'Busy',
                count: teamCapacity.counts.Busy,
                base: `rgba(${CAPACITY_STATUS_COLOR.Busy.rgb}`,
                text: CAPACITY_STATUS_COLOR.Busy.text,
              },
            ] as const
          ).map((pill) => {
            const active = employeeStatusFilter === pill.key;
            return (
              <button
                key={pill.key}
                onClick={() => onStatusFilterChange(active ? 'all' : pill.key)}
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
            className="text-xl font-bold tabular-nums mt-1"
            style={{
              color:
                teamCapacity.utilization >= 90
                  ? CAPACITY_STATUS_COLOR.Busy.text
                  : teamCapacity.utilization >= 70
                    ? CAPACITY_STATUS_COLOR.Moderate.text
                    : CAPACITY_STATUS_COLOR.Available.text,
            }}
          >
            {teamCapacity.utilization}%
          </div>
        </div>
        <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
          <div className="text-[10px] uppercase tracking-wider text-[#737373]">Slack Remaining</div>
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
            className="h-full bg-status-in-progress"
            style={{
              width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInProgress / teamCapacity.totalCapacity) * 100 : 0}%`,
            }}
            title={`In progress: ${teamCapacity.totalInProgress}h`}
          />
          <div
            className="h-full bg-status-in-review"
            style={{
              width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInReview / teamCapacity.totalCapacity) * 100 : 0}%`,
            }}
            title={`In review: ${teamCapacity.totalInReview}h`}
          />
          <div
            className="h-full bg-status-done"
            style={{
              width: `${teamCapacity.totalCapacity ? (teamCapacity.totalDone / teamCapacity.totalCapacity) * 100 : 0}%`,
            }}
            title={`Done: ${teamCapacity.totalDone}h`}
          />
        </div>
        <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-status-in-progress" />
            In progress · {teamCapacity.totalInProgress}h
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-status-in-review" />
            In review · {teamCapacity.totalInReview}h
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-status-done" />
            Done · {teamCapacity.totalDone}h
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[rgba(255,255,255,0.15)]" />
            Remaining · {teamCapacity.totalRemaining}h
          </span>
        </div>
      </div>
    </div>
  );
};

export default TeamCapacityOverview;
