// Pure render helpers + avatar palette extracted verbatim from WorkItemPanel.
// No hooks, no side effects — safe to call during render of any sub-component.

import type { WorkItem } from '../types';

/**
 * Pure predicate mirroring the original `renderCompactHierarchy()` truthiness
 * gate (it returned `null` when there was nothing to show). The view-mode
 * region used the function's return value both to decide whether to render the
 * "Linked Items" wrapper AND as the content — this keeps that behavior without
 * rendering the component twice.
 */
export function hasCompactHierarchy(item: WorkItem): boolean {
  if (item.type === 'subtask') return !!item.parent_key;
  return !!item.epic_key;
}

// Comment-body rendering (mention pills + inline links) now lives in the shared
// `@/components/CommentThread`, which owns the single renderer for both the
// work-item panel and the Reviewer queue.

export const AVATAR_PALETTE = ['#E0B954', '#60A5FA', '#34D399', '#A78BFA', '#F97316', '#F43F5E'];

export const avatarColor = (id: number | null | undefined) =>
  AVATAR_PALETTE[(id ?? 0) % AVATAR_PALETTE.length];
