import { projectColor, statusBadgeColor } from './types';
import type { CapacityTicket, DeveloperCapacity } from './types';

/** A project bucket of an employee's capacity tickets, used by the inline
 *  distribution bar and the expanded per-project breakdown. */
export interface ProjectGroup {
  projectId: number;
  projectName: string;
  tickets: CapacityTicket[];
  total: number;
  logged: number;
}

interface EmployeeExpandedRowProps {
  devCapacity: DeveloperCapacity | undefined;
  tickets: CapacityTicket[];
  projectsByHours: ProjectGroup[];
}

/** The expanded drill-down for one employee row — week range + per-project
 *  ticket breakdown cards. Rendered inside a full-width <td colSpan={7}>. */
const EmployeeExpandedRow: React.FC<EmployeeExpandedRowProps> = ({
  devCapacity,
  tickets,
  projectsByHours,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-[#737373]">
          Week:{' '}
          <span className="text-[#a3a3a3] font-mono">
            {devCapacity?.week_start
              ? new Date(devCapacity.week_start).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : '—'}
            {' → '}
            {devCapacity?.week_end
              ? new Date(devCapacity.week_end).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : '—'}
          </span>
          <span className="ml-2 text-[#737373]">(Sat → Fri, UTC)</span>
        </div>
        {tickets.length === 0 && (
          <span className="text-xs text-[#737373]">No tickets contributing this week.</span>
        )}
      </div>

      {projectsByHours.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projectsByHours.map((p) => {
            const color = projectColor(p.projectId);
            const sortedTickets = [...p.tickets].sort((a, b) => b.counted_hours - a.counted_hours);
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
                  <span className="text-xs font-mono tabular-nums flex-shrink-0 flex items-baseline gap-1.5">
                    {p.logged > 0 && (
                      <span
                        className="text-[10px] text-[#737373]"
                        title="Hours actually logged this week"
                      >
                        {p.logged}h logged
                      </span>
                    )}
                    <span style={{ color }} title="Counted against this week's capacity">
                      {p.total}h
                    </span>
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
                            {t.counted_basis === 'remaining (transferred)' && (
                              <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">
                                transferred
                              </span>
                            )}
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
  );
};

export default EmployeeExpandedRow;
