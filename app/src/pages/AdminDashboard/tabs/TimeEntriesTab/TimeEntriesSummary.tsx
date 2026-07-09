import { AlertTriangle } from 'lucide-react';
import { formatRangeDate } from './types';

interface TimeEntriesSummaryProps {
  truncated: boolean;
  /** Pre-aggregation raw count from the server — quoted in the truncation notice. */
  totalRawRows: number;
  from: string | null;
  to: string | null;
}

/** Active date range line + truncation warning (shown above the table). */
const TimeEntriesSummary: React.FC<TimeEntriesSummaryProps> = ({
  truncated,
  totalRawRows,
  from,
  to,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-[#737373]">
        <span>Showing</span>
        <span className="text-[#a3a3a3] font-medium">{from ? formatRangeDate(from) : '—'}</span>
        <span className="text-[#525252]">→</span>
        <span className="text-[#a3a3a3] font-medium">{to ? formatRangeDate(to) : '—'}</span>
      </div>

      {truncated && (
        <div className="rounded-lg border border-[#E0B954]/30 bg-[#E0B954]/10 p-3 flex items-center gap-2 text-xs text-[#E0B954]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Capped at {totalRawRows.toLocaleString()} raw entries before aggregation. Refine your
          filters to include older data.
        </div>
      )}
    </div>
  );
};

export default TimeEntriesSummary;
