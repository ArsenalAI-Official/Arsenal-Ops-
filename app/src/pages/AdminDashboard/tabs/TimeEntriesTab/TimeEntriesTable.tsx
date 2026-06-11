import { Clock } from 'lucide-react';
import EntryRow from './EntryRow';
import type { EntryGroup, TimeEntryRow } from './types';

interface TimeEntriesTableProps {
  isLoading: boolean;
  isError: boolean;
  rows: TimeEntryRow[];
  /** Non-null when group-by is active; the flat list is used otherwise. */
  groupedRows: EntryGroup[] | null;
}

/** The entries table — loading / error / empty states, then either a flat
 *  list or one <tbody> per group (week or month). */
const TimeEntriesTable: React.FC<TimeEntriesTableProps> = ({
  isLoading,
  isError,
  rows,
  groupedRows,
}) => {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-red-400">Failed to load time entries.</div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center">
          <Clock className="w-8 h-8 text-[#525252] mx-auto mb-2" />
          <p className="text-sm text-[#737373]">No time entries match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[rgba(255,255,255,0.02)]">
              <tr className="text-left text-[11px] uppercase tracking-wider text-[#737373]">
                <th className="px-4 py-2.5 font-medium">Logged at</th>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium text-right">Hours</th>
              </tr>
            </thead>
            {groupedRows ? (
              // Grouped view — one <tbody> per group (week or month),
              // each with a header row (sub-total) and an entry row per
              // TimeEntry. Multiple <tbody>s in one <table> is valid
              // HTML and lets us scope the row dividers per group.
              groupedRows.map((group) => (
                <tbody key={group.key} className="divide-y divide-[rgba(255,255,255,0.04)]">
                  <tr className="bg-[rgba(224,185,84,0.06)] border-t border-[#E0B954]/20">
                    <td
                      colSpan={3}
                      className="px-4 py-2 text-xs font-semibold text-[#E0B954] uppercase tracking-wider"
                    >
                      {group.label}
                      <span className="ml-2 text-[10px] font-normal text-[#a3a3a3]">
                        ({group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-[#E0B954]">
                      {group.totalHours}h
                    </td>
                  </tr>
                  {group.entries.map((row) => (
                    <EntryRow key={row.id} row={row} />
                  ))}
                </tbody>
              ))
            ) : (
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {rows.map((row) => (
                  <EntryRow key={row.id} row={row} />
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default TimeEntriesTable;
