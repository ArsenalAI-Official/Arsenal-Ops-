import { Clock, ChevronRight, ChevronDown, FolderKanban, Users } from 'lucide-react';
import { Fragment } from 'react';
import EntryRow from './EntryRow';
import { VIEW_LABELS, formatRangeDate } from './types';
import type { GroupRow, ViewMode } from './types';

interface TimeEntriesTableProps {
  isLoading: boolean;
  isError: boolean;
  viewMode: ViewMode;
  /** One row per (day, employee|client|project). */
  rows: GroupRow[];
  /** Keys of the rows currently expanded. */
  expandedRows: Set<string>;
  onToggleRow: (key: string) => void;
}

/**
 * Date · {dimension} · Hours table for the active view. Each row expands to the
 * per-dimension split for that day (employee→projects+client, project→employees
 * — see VIEW_LABELS).
 */
const TimeEntriesTable: React.FC<TimeEntriesTableProps> = ({
  isLoading,
  isError,
  viewMode,
  rows,
  expandedRows,
  onToggleRow,
}) => {
  const labels = VIEW_LABELS[viewMode];
  const hasSecondary = labels.childSecondary != null;
  // The breakdown dimension is projects in the employee view, employees otherwise.
  const childIcon = viewMode === 'employee' ? FolderKanban : Users;
  const childNoun = labels.childPrimary.toLowerCase();

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
                <th className="px-4 py-2.5 font-medium w-8" aria-label="Expand" />
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">{labels.primary}</th>
                <th className="px-4 py-2.5 font-medium text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
              {rows.map((row) => {
                const isExpanded = expandedRows.has(row.key);
                return (
                  <Fragment key={row.key}>
                    <tr
                      className="hover:bg-[rgba(255,255,255,0.025)] cursor-pointer"
                      onClick={() => onToggleRow(row.key)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} breakdown for ${row.label} on ${formatRangeDate(row.dayKey)}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggleRow(row.key);
                        }
                      }}
                    >
                      <td className="px-4 py-3 text-[#737373]">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#a3a3a3] whitespace-nowrap">
                        {formatRangeDate(row.dayKey)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{row.label}</div>
                        {row.sublabel && (
                          <div className="text-[11px] text-[#737373]">{row.sublabel}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white tabular-nums whitespace-nowrap">
                        {row.hours}h
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[rgba(224,185,84,0.02)]">
                        <td
                          colSpan={4}
                          className="px-4 pb-4 pt-1"
                          aria-label={`${row.label} breakdown`}
                        >
                          <div className="ml-8 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0c0c0c] overflow-hidden shadow-lg shadow-black/20">
                            {/* Sub-panel header */}
                            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)]">
                              <span className="text-xs uppercase tracking-wider text-[#8a8a8a] font-semibold">
                                By {childNoun}
                              </span>
                              <span className="text-xs text-[#525252]">
                                {row.children.length} {childNoun}
                                {row.children.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            {/* Breakdown rows */}
                            <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                              {row.children.map((c) => (
                                <EntryRow
                                  key={c.key}
                                  row={c}
                                  icon={childIcon}
                                  showSecondary={hasSecondary}
                                />
                              ))}
                            </div>
                            {/* Total footer — confirms the split sums to the row's hours */}
                            <div className="flex items-center justify-between px-3 py-2.5 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                              <span className="text-xs uppercase tracking-wider text-[#8a8a8a] font-semibold">
                                Total
                              </span>
                              <span className="text-sm font-bold text-white tabular-nums">
                                {row.hours}h
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TimeEntriesTable;
