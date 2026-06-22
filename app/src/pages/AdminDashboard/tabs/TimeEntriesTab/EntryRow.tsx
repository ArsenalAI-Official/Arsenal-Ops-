import { formatLoggedAt } from './types';
import type { AggregatedRow } from './types';

/**
 * One row in the entries table. Renders an aggregated (employee × project ×
 * day) row. Extracted so the flat-list branch and the grouped branch share the
 * same cell markup — otherwise the same four `<td>`s lived in two places and
 * could silently drift apart.
 */
const EntryRow: React.FC<{ row: AggregatedRow }> = ({ row }) => (
  <tr className="hover:bg-[rgba(255,255,255,0.025)]">
    <td className="px-4 py-3 text-[#a3a3a3] whitespace-nowrap">{formatLoggedAt(row.logged_at)}</td>
    <td className="px-4 py-3 text-white">
      {row.developer_name ?? <span className="text-[#737373] italic">deleted</span>}
    </td>
    <td className="px-4 py-3 text-[#F4F6FF]">
      {row.project_name ?? <span className="text-[#737373] italic">—</span>}
    </td>
    <td className="px-4 py-3 text-right font-semibold text-white">{row.hours}h</td>
  </tr>
);

export default EntryRow;
