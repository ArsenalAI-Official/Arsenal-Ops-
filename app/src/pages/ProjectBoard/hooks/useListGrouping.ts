import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildEpicGroups } from '@/lib/hierarchy/buildEpicGroups';
import type { WorkItem, Sprint } from '@/types/workItems';
import { parseLocalDate, getWeekStart, formatWeekRange } from '../lib/listGrouping';
import {
  isSprintCompleted as isSprintCompletedPure,
  isSprintActive as isSprintActivePure,
} from '../lib/sprintStatus';

/**
 * Owns the list-view grouping layer: the `listGroupBy` toggle (persisted to
 * localStorage), the per-group collapse set, the today memos, and the
 * sprint / epic / week group memos.
 *
 * Called ONCE in the ProjectBoard orchestrator after `useBoardData` +
 * `useBoardFilters`. Inputs are the memo-stable `filteredItems` / `sprints` /
 * `workItems` references so the group memos actually hold instead of busting
 * every render. `showCompletedSprints` stays an orchestrator-owned UI toggle
 * (its button lives in the still-inline list-view JSX) and is threaded in.
 */
export function useListGrouping(params: {
  filteredItems: WorkItem[];
  workItems: WorkItem[];
  sprints: Sprint[];
  id: string | undefined;
  showCompletedSprints: boolean;
}) {
  const { filteredItems, workItems, sprints, id, showCompletedSprints } = params;

  const [listGroupBy, setListGroupBy] = useState<'sprint' | 'week'>(() => {
    if (typeof window === 'undefined') return 'sprint';
    try {
      const stored = window.localStorage.getItem(`projectBoard.listGroupBy.${id ?? ''}`);
      if (stored === 'week') return stored;
      // 'epic' was a valid list grouping before Epic became a top-level view — clear it.
      if (stored === 'epic') {
        try {
          window.localStorage.removeItem(`projectBoard.listGroupBy.${id ?? ''}`);
        } catch {
          /* ignore */
        }
      }
      return 'sprint';
    } catch {
      return 'sprint';
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;
    try {
      window.localStorage.setItem(`projectBoard.listGroupBy.${id}`, listGroupBy);
    } catch {
      /* ignore quota errors */
    }
  }, [listGroupBy, id]);

  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());

  // Sprint grouping for list view. `listViewToday` only needs day granularity,
  // so compute it once per mount (also satisfies react-hooks/purity, which
  // forbids a bare new Date() in the render body).
  const listViewToday = useMemo(() => new Date().toISOString().split('T')[0], []);
  // Hoisted out of the per-row list map below (was a `new Date()` allocated for
  // every row + a react-hooks/purity violation). Day granularity is enough.
  const todayMidnightMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const isSprintCompleted = useCallback(
    (s: Sprint) => isSprintCompletedPure(s, listViewToday),
    [listViewToday],
  );
  const isSprintActive = useCallback(
    (s: Sprint) => isSprintActivePure(s, listViewToday),
    [listViewToday],
  );

  // Memoized so these filter+sort chains don't re-run on every render (e.g. on
  // every keystroke/drag) regardless of which view is active.
  const orderedListSprints = useMemo(
    () => [
      ...sprints
        .filter((s) => !isSprintCompleted(s) && isSprintActive(s))
        .sort(
          (a, b) => new Date(b.start_date ?? 0).getTime() - new Date(a.start_date ?? 0).getTime(),
        ),
      ...sprints
        .filter((s) => !isSprintCompleted(s) && !isSprintActive(s))
        .sort(
          (a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime(),
        ),
      ...(showCompletedSprints
        ? sprints
            .filter(isSprintCompleted)
            .sort(
              (a, b) => new Date(b.end_date ?? 0).getTime() - new Date(a.end_date ?? 0).getTime(),
            )
        : []),
    ],
    [sprints, isSprintCompleted, isSprintActive, showCompletedSprints],
  );

  const listViewGroups = useMemo(
    () =>
      [
        ...orderedListSprints.map((sprint) => ({
          key: String(sprint.id),
          label: sprint.name,
          isCompleted: isSprintCompleted(sprint),
          items: filteredItems.filter((item) => item.sprint_id === sprint.id),
        })),
        {
          key: 'backlog',
          label: 'Backlog',
          isCompleted: false,
          items: filteredItems.filter((item) => !item.sprint_id),
        },
      ].filter((g) => g.items.length > 0),
    [orderedListSprints, filteredItems, isSprintCompleted],
  );

  const listViewEpicGroups = useMemo(
    () => buildEpicGroups(filteredItems, workItems).groups,
    [filteredItems, workItems],
  );

  // Group items into ISO weeks by their "relevant date":
  //   completed → completed_at (the week the work actually finished)
  //   not completed + due_date → due_date (lands in past weeks when overdue,
  //                                        future weeks when upcoming)
  //   neither → Unscheduled bucket
  // Result: past weeks read as "what got done + what slipped", current/future
  // weeks read as "what's coming due".
  const listViewWeekGroups = useMemo(() => {
    const todayWeekStart = getWeekStart(new Date());
    const buckets = new Map<string, WorkItem[]>();
    for (const item of filteredItems) {
      let weekKey: string | null = null;
      if (item.completed_at) {
        weekKey = getWeekStart(new Date(item.completed_at));
      } else if (item.due_date) {
        const d = parseLocalDate(item.due_date);
        if (d) weekKey = getWeekStart(d);
      }
      const key = weekKey ?? '__unscheduled__';
      const existing = buckets.get(key);
      if (existing) existing.push(item);
      else buckets.set(key, [item]);
    }
    const dated = [...buckets.keys()].filter((k) => k !== '__unscheduled__').sort();
    const todayMs = parseLocalDate(todayWeekStart)?.getTime() ?? 0;
    const groups = dated.map((weekStart) => {
      let label: string;
      if (weekStart === todayWeekStart) {
        label = 'This Week';
      } else {
        const ws = parseLocalDate(weekStart)?.getTime() ?? 0;
        const weeksAway = Math.round((ws - todayMs) / (7 * 86400000));
        if (weeksAway === -1) label = 'Last Week';
        else if (weeksAway === 1) label = 'Next Week';
        else label = formatWeekRange(weekStart);
      }
      return {
        key: `week:${weekStart}`,
        weekStart,
        label,
        isCurrent: weekStart === todayWeekStart,
        isPast: weekStart < todayWeekStart,
        items: buckets.get(weekStart) ?? [],
      };
    });
    if (buckets.has('__unscheduled__')) {
      groups.push({
        key: 'week:unscheduled',
        weekStart: '',
        label: 'Unscheduled',
        isCurrent: false,
        isPast: false,
        items: buckets.get('__unscheduled__') ?? [],
      });
    }
    return groups;
  }, [filteredItems]);

  const toggleSprintCollapse = (key: string) => {
    setCollapsedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return {
    listGroupBy,
    setListGroupBy,
    collapsedSprints,
    toggleSprintCollapse,
    todayMidnightMs,
    orderedListSprints,
    listViewGroups,
    listViewEpicGroups,
    listViewWeekGroups,
  };
}
