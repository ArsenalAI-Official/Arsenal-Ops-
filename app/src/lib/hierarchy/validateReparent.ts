export type WorkItemType = 'user_story' | 'task' | 'bug' | 'epic' | 'subtask';

export type RelationshipField = 'epic_id' | 'parent_id';

export interface HierarchyItem {
  id: string;
  type: WorkItemType;
  parent_id?: number | null;
  epic_id?: number | null;
}

// Canonical model: Epic → (Story | Task | Bug) → Subtask. Mirrors
// backend/services/hierarchy.py::ALLOWED_PARENT_TYPES. Keep the two in sync.
const TYPE_PAIR_RULES: Record<RelationshipField, Partial<Record<WorkItemType, WorkItemType[]>>> = {
  epic_id: {
    user_story: ['epic'],
    task: ['epic'],
    bug: ['epic'],
    epic: [],
    // Subtasks reach the epic transitively through their parent — no direct link.
    subtask: [],
  },
  parent_id: {
    task: [],
    user_story: [],
    bug: [],
    epic: [],
    subtask: ['user_story', 'task', 'bug'],
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

  // Depth-1 cap (matches backend services/hierarchy.py):
  // - target itself must not already have a parent (would make subject depth-2)
  // - subject must not already have children (would push them to depth-2)
  if (field === 'parent_id') {
    if (target.parent_id != null) {
      return {
        ok: false,
        reason:
          'That item is already a child of another item — can’t nest more than one level deep',
      };
    }
    if (subjectHasChildren(subject, allItems)) {
      return {
        ok: false,
        reason:
          'This item already has children — giving it a parent would exceed the one-level nesting limit',
      };
    }
  }

  return { ok: true };
}

export function subjectHasChildren(subject: HierarchyItem, allItems: HierarchyItem[]): boolean {
  const subjectNumericId = Number(subject.id);
  if (Number.isNaN(subjectNumericId)) return false;
  return allItems.some((it) => it.parent_id === subjectNumericId);
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
  if (t === 'user_story') return 'story';
  return t;
}
