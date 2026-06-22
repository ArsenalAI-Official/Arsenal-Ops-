import { useMemo, useState } from 'react';
import { makeListItemComparator, type ListSortKey } from '../lib/listSort';

/**
 * Owns the shared sort state for the By Sprint / By Week / By Epic list views.
 * Sorting applies within each group; it doesn't reorder groups themselves.
 * Null `listSortKey` = each group's natural order (preserves the parent→child
 * clustering in the By Epic view).
 *
 * `renderListSortHeader` (the JSX-returning header-cell helper) stays in the
 * ProjectBoard orchestrator for now — commit 9 owns the list view — so this
 * hook returns only the sort state, the cycle handler, and the memoized
 * comparator (which wraps the pure `makeListItemComparator` from lib/listSort).
 */
export function useListSort() {
  const [listSortKey, setListSortKey] = useState<ListSortKey | null>(null);
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc');
  const handleListSort = (key: ListSortKey) => {
    if (listSortKey === key) {
      if (listSortDir === 'asc') setListSortDir('desc');
      else setListSortKey(null);
    } else {
      setListSortKey(key);
      setListSortDir('asc');
    }
  };
  const listItemComparator = useMemo(
    () => makeListItemComparator(listSortKey, listSortDir),
    [listSortKey, listSortDir],
  );

  return { listSortKey, listSortDir, handleListSort, listItemComparator };
}
