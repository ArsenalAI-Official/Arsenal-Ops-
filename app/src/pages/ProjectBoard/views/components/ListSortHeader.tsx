import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { ListSortKey } from '../../lib/listSort';

export interface ListSortHeaderProps {
  /** Column display label. */
  label: string;
  /** Sort key this header controls. */
  sortKey: ListSortKey;
  /** Currently-active sort key (null when unsorted). */
  activeKey: ListSortKey | null;
  /** Current sort direction. */
  sortDir: 'asc' | 'desc';
  /** Cycle handler: asc → desc → off for the given key. */
  onSort: (key: ListSortKey) => void;
}

/**
 * Sortable column-header cell for the list + epic views. Extracted verbatim
 * from ProjectBoard's former `renderListSortHeader` helper; shared by every
 * group table header so the sort affordance stays identical across views.
 */
const ListSortHeader = ({ label, sortKey, activeKey, sortDir, onSort }: ListSortHeaderProps) => {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-left uppercase tracking-wider hover:text-white transition-colors ${
        active ? 'text-brand' : ''
      }`}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
    </button>
  );
};

export default ListSortHeader;
