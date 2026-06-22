import { Clock, ChevronRight, ChevronDown } from 'lucide-react';
import EntryRow from './EntryRow';
import type { AggregatedRow, EntryGroup } from './types';

interface TimeEntriesTableProps {
  isLoading: boolean;
  isError: boolean;
  /** Aggregated (employee × project × day) rows — the flat list. */
  rows: AggregatedRow[];
  /** Non-null when group-by is active; the flat list is used otherwise. */
  groupedRows: EntryGroup[] | null;
  /** Keys of the groups currently expanded (groups start collapsed). */
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
}

/** The entries table — loading / error / empty states, then either a flat
 *  list or one collapsible <tbody> per group (week or month). */
const TimeEntriesTable: React.FC<TimeEntriesTableProps> = ({
  isLoading,
  isError,
  rows,
  groupedRows,
  expandedGroups,
  onToggleGroup,
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
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium text-right">Hours</th>
              </tr>
            </thead>
            {groupedRows ? (
              // Grouped view — one <tbody> per group (week or month). The header
              // row toggles expand/collapse; entries render only when expanded
              // (default collapsed). Multiple <tbody>s in one <table> is valid
              // HTML and lets us scope the row dividers per group.
              groupedRows.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                return (
                  <tbody key={group.key} className="divide-y divide-[rgba(255,255,255,0.04)]">
                    <tr
                      className="bg-[rgba(224,185,84,0.06)] border-t border-[#E0B954]/20 cursor-pointer hover:bg-[rgba(224,185,84,0.1)] transition-colors"
                      onClick={() => onToggleGroup(group.key)}
                      // Keyboard a11y — the header row acts as an expand/collapse
                      // toggle, so it needs the role + key handler a <button>
                      // would provide for free.
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggleGroup(group.key);
                        }
                      }}
                    >
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-xs font-semibold text-[#E0B954] uppercase tracking-wider"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          {group.label}
                        </span>
                        <span className="ml-2 text-[10px] font-normal text-[#a3a3a3]">
                          ({group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                          )
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-[#E0B954]">
                        {group.totalHours}h
                      </td>
                    </tr>
                    {isExpanded && group.entries.map((row) => <EntryRow key={row.key} row={row} />)}
                  </tbody>
                );
              })
            ) : (
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {rows.map((row) => (
                  <EntryRow key={row.key} row={row} />
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
