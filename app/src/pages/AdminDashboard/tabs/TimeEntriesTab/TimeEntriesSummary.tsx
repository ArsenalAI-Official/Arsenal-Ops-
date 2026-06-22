import { AlertTriangle } from 'lucide-react';
import { formatRangeDate } from './types';
import type { GroupBy } from './types';

interface TimeEntriesSummaryProps {
  totalHours: number;
  /** Post-aggregation row count — matches what the table shows. */
  entriesCount: number;
  /** Pre-aggregation raw count from the server — quoted in the truncation notice. */
  totalRawRows: number;
  truncated: boolean;
  from: string | null;
  to: string | null;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
}

/** Totals strip + truncation warning + group-by view-mode toggle. */
const TimeEntriesSummary: React.FC<TimeEntriesSummaryProps> = ({
  totalHours,
  entriesCount,
  totalRawRows,
  truncated,
  from,
  to,
  groupBy,
  onGroupByChange,
}) => {
  return (
    <>
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Total hours</p>
          <p className="text-2xl font-bold text-white mt-1">{totalHours}h</p>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Entries</p>
          {/* After-aggregation count so this matches the rows shown below.
              Total hours stays the server's sum (preserved across the collapse). */}
          <p className="text-2xl font-bold text-white mt-1">{entriesCount}</p>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-[#737373]">Range</p>
          <p className="text-sm font-medium text-white mt-1">
            {from ? formatRangeDate(from) : '—'} <span className="text-[#525252]">→</span>{' '}
            {to ? formatRangeDate(to) : '—'}
          </p>
        </div>
      </div>

      {/* Truncation warning */}
      {truncated && (
        <div className="rounded-lg border border-[#E0B954]/30 bg-[#E0B954]/10 p-3 flex items-center gap-2 text-xs text-[#E0B954]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Capped at {totalRawRows} raw entries before aggregation. Refine your filters to include
          older data.
        </div>
      )}

      {/* Group-by toggle — sits above the table so it reads as a "view mode"
          rather than a filter (filters change the dataset; group-by just
          changes how that dataset is rendered). */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-[#737373] mr-1">Group by</span>
        {(
          [
            { id: 'none', label: 'None' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ] as const
        ).map((opt) => {
          const active = groupBy === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onGroupByChange(opt.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                  : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default TimeEntriesSummary;
