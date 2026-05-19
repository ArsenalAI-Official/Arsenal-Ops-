export type WorkItemType = 'user_story' | 'task' | 'bug' | 'epic';

export type RelationshipField = 'epic_id' | 'parent_id';

export interface HierarchyItem {
  id: string;
  type: WorkItemType;
  parent_id?: number | null;
  epic_id?: number | null;
}

const TYPE_PAIR_RULES: Record<RelationshipField, Partial<Record<WorkItemType, WorkItemType[]>>> = {
  epic_id: {
    user_story: ['epic'],
    task: ['epic'],
    bug: ['epic'],
    epic: [],
  },
  parent_id: {
    task: ['task', 'user_story'],
    user_story: [],
    bug: [],
    epic: [],
  },
};

export interface ReparentValidation {
  ok: boolean;
  reason?: string;
}

export function getAllowedTargetTypes(
  subjectType: WorkItemType,
  field: RelationshipField,
): WorkItemType[] {
  return TYPE_PAIR_RULES[field][subjectType] ?? [];
}

export function fieldSupportsType(subjectType: WorkItemType, field: RelationshipField): boolean {
  return getAllowedTargetTypes(subjectType, field).length > 0;
}

export function validateReparent(
  subject: HierarchyItem,
  target: HierarchyItem | null,
  field: RelationshipField,
  allItems: HierarchyItem[],
): ReparentValidation {
  if (target === null) return { ok: true };

  if (target.id === subject.id) {
    return {
      ok: false,
      reason: `An item cannot be its own ${field === 'epic_id' ? 'epic' : 'parent'}`,
    };
  }

  const allowed = getAllowedTargetTypes(subject.type, field);
  if (!allowed.includes(target.type)) {
    return {
      ok: false,
      reason: `A ${humanType(subject.type)} cannot have a ${humanType(target.type)} as its ${field === 'epic_id' ? 'epic' : 'parent'}`,
    };
  }

  if (wouldCreateCycle(subject, target, field, allItems)) {
    return { ok: false, reason: 'This would create a cycle' };
  }

  return { ok: true };
}

export function wouldCreateCycle(
  subject: HierarchyItem,
  target: HierarchyItem,
  field: RelationshipField,
  allItems: HierarchyItem[],
): boolean {
  const byNumericId = new Map<number, HierarchyItem>();
  for (const it of allItems) {
    const n = Number(it.id);
    if (!Number.isNaN(n)) byNumericId.set(n, it);
  }
  const subjectNumericId = Number(subject.id);
  let cursor: HierarchyItem | undefined = target;
  let depth = 0;
  while (cursor && depth < 100) {
    if (Number(cursor.id) === subjectNumericId) return true;
    const next = cursor[field];
    if (next == null) break;
    cursor = byNumericId.get(next);
    depth++;
  }
  return false;
}

function humanType(t: WorkItemType): string {
  return t === 'user_story' ? 'story' : t;
}
