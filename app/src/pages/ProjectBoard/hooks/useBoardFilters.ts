import { useState, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { WorkItem } from '@/types/workItems';

/**
 * Owns the board's filter layer: search text, the type/priority/assignee/tag
 * filters, the filter + sprint menu-open flags and their outside-click refs,
 * the single outside-click effect, the derived `existingTags` /
 * `filteredItems` / `columnItemsByStatus` memos, and the clear/toggle helpers.
 *
 * Called ONCE in the ProjectBoard orchestrator. `filteredItems` and
 * `columnItemsByStatus` are memoized so `KanbanCard` / `BoardColumn`
 * (both `React.memo`) can rely on stable array references when filters don't
 * change. The orchestrator threads `selectedSprintId` in so the sprint filter
 * participates in the same memoized chain.
 */
export function useBoardFilters(
  workItems: WorkItem[],
  selectedSprintId: number | 'all' | 'unassigned',
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSprintMenu, setShowSprintMenu] = useState(false);
  const [assigneeSearchFilter, setAssigneeSearchFilter] = useState('');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const sprintMenuRef = useRef<HTMLDivElement>(null);

  // Single outside-click listener for both the filter and sprint menus. We
  // only attach it when at least one menu is open so we don't pay for the
  // global event handler in the common case where everything is closed.
  useEffect(() => {
    if (!showFilterMenu && !showSprintMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showFilterMenu && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setShowFilterMenu(false);
        setAssigneeSearchFilter('');
      }
      if (showSprintMenu && sprintMenuRef.current && !sprintMenuRef.current.contains(target)) {
        setShowSprintMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu, showSprintMenu]);

  // Derived: unique tags computed from cached workItems — no useEffect needed
  const existingTags = useMemo(
    () =>
      Array.from(
        new Set(
          workItems
            .filter((item) => item.type === 'task')
            .flatMap((item) => (item.tags ?? []).map((t: string) => String(t).trim().toLowerCase()))
            .filter(Boolean),
        ),
      ).sort(),
    [workItems],
  );

  // Filtered items — memoized so KanbanCard React.memo + BoardColumn React.memo
  // can rely on stable array references when filters don't change.
  const filteredItems = useMemo(
    () =>
      workItems.filter((item) => {
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const titleMatch = item.title.toLowerCase().includes(searchLower);
          const keyMatch = item.key.toLowerCase().includes(searchLower);
          if (!titleMatch && !keyMatch) return false;
        }
        if (filterTypes.length > 0 && !filterTypes.includes(item.type)) return false;
        if (filterPriorities.length > 0 && !filterPriorities.includes(item.priority)) return false;
        if (filterAssignees.length > 0) {
          const isUnassigned = item.assignee_id === null || item.assignee_id === undefined;
          const matchesUnassigned = filterAssignees.includes('unassigned') && isUnassigned;
          const matchesAssignee = filterAssignees.some(
            (id) => id !== 'unassigned' && String(item.assignee_id) === id,
          );
          if (!matchesUnassigned && !matchesAssignee) return false;
        }
        // Tags filter - if any tags are selected, item must have at least one of them
        if (filterTags.length > 0) {
          const hasMatchingTag = filterTags.some((tag) => item.tags?.includes(tag));
          if (!hasMatchingTag) return false;
        }
        // Sprint filter
        if (selectedSprintId === 'unassigned' && item.sprint_id !== null) return false;
        if (typeof selectedSprintId === 'number' && item.sprint_id !== selectedSprintId)
          return false;
        return true;
      }),
    [
      workItems,
      searchQuery,
      filterTypes,
      filterPriorities,
      filterAssignees,
      filterTags,
      selectedSprintId,
    ],
  );

  // Precompute per-status column buckets once per filter change so each
  // BoardColumn receives a stable items reference — required for the
  // React.memo equality check on BoardColumn to skip re-renders.
  const columnItemsByStatus = useMemo(() => {
    const buckets: Record<string, WorkItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const item of filteredItems) {
      const bucket = buckets[item.status];
      if (bucket) bucket.push(item);
    }
    return buckets;
  }, [filteredItems]);

  const activeFilterCount =
    filterTypes.length + filterPriorities.length + filterAssignees.length + filterTags.length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setFilterTypes([]);
    setFilterPriorities([]);
    setFilterAssignees([]);
    setFilterTags([]);
  };
  const toggleArrayFilter = (setter: Dispatch<SetStateAction<string[]>>, value: string) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return {
    searchQuery,
    setSearchQuery,
    filterTypes,
    setFilterTypes,
    filterPriorities,
    setFilterPriorities,
    filterAssignees,
    setFilterAssignees,
    filterTags,
    setFilterTags,
    showFilterMenu,
    setShowFilterMenu,
    showSprintMenu,
    setShowSprintMenu,
    assigneeSearchFilter,
    setAssigneeSearchFilter,
    filterMenuRef,
    sprintMenuRef,
    existingTags,
    filteredItems,
    columnItemsByStatus,
    activeFilterCount,
    hasActiveFilters,
    clearAllFilters,
    toggleArrayFilter,
  };
}
