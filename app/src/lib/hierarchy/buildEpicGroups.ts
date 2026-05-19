import type { HierarchyItem } from './validateReparent';

export interface EpicGroupRow<T> {
  item: T;
  depth: 0 | 1;
}

export interface EpicGroup<T> {
  key: string;
  label: string;
  epic: T | null;
  rows: EpicGroupRow<T>[];
  count: number;
}

export interface BuildEpicGroupsResult<T> {
  groups: EpicGroup<T>[];
}

/**
 * Group items by epic, with subtasks indented under their parent inside each group.
 * - Epics themselves are section headers, not rows.
 * - Items whose epic_id points to an epic not in `allItems` (e.g. out of scope) go to "No epic".
 * - Subtasks (parent_id within the same group) render at depth 1 right after their parent.
 */
export function buildEpicGroups<T extends HierarchyItem & { key?: string; title?: string }>(
  items: T[],
  allItems: T[],
): BuildEpicGroupsResult<T> {
  const epicById = new Map<number, T>();
  for (const e of allItems) {
    if (e.type === 'epic') {
      const n = Number(e.id);
      if (!Number.isNaN(n)) epicById.set(n, e);
    }
  }

  const nonEpicItems = items.filter((it) => it.type !== 'epic');
  const byEpicId = new Map<number, T[]>();
  const unparented: T[] = [];

  for (const it of nonEpicItems) {
    if (it.epic_id != null && epicById.has(it.epic_id)) {
      const arr = byEpicId.get(it.epic_id) ?? [];
      arr.push(it);
      byEpicId.set(it.epic_id, arr);
    } else {
      unparented.push(it);
    }
  }

  const groups: EpicGroup<T>[] = [];

  const epicEntries = Array.from(byEpicId.entries())
    .map(([epicId, groupItems]) => ({
      epic: epicById.get(epicId)!,
      groupItems,
    }))
    .filter((e) => Boolean(e.epic));

  epicEntries.sort((a, b) => (a.epic.key ?? '').localeCompare(b.epic.key ?? ''));

  for (const { epic, groupItems } of epicEntries) {
    const rows = orderWithSubtasks(groupItems);
    groups.push({
      key: `epic-${epic.id}`,
      label: epic.title || epic.key || 'Epic',
      epic,
      rows,
      count: rows.length,
    });
  }

  if (unparented.length > 0) {
    const rows = orderWithSubtasks(unparented);
    groups.push({
      key: 'unparented',
      label: 'No epic',
      epic: null,
      rows,
      count: rows.length,
    });
  }

  return { groups };
}

function orderWithSubtasks<T extends HierarchyItem>(groupItems: T[]): EpicGroupRow<T>[] {
  const ids = new Set(groupItems.map((i) => Number(i.id)));
  const childrenByParent = new Map<number, T[]>();
  const parents: T[] = [];

  for (const i of groupItems) {
    if (i.parent_id != null && ids.has(i.parent_id)) {
      const arr = childrenByParent.get(i.parent_id) ?? [];
      arr.push(i);
      childrenByParent.set(i.parent_id, arr);
    } else {
      parents.push(i);
    }
  }

  const out: EpicGroupRow<T>[] = [];
  for (const p of parents) {
    out.push({ item: p, depth: 0 });
    const kids = childrenByParent.get(Number(p.id)) ?? [];
    for (const k of kids) out.push({ item: k, depth: 1 });
  }
  return out;
}
