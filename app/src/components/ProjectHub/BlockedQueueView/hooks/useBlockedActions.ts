import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import type { CommentThreadComment, CommentType } from '@/components/CommentThread';
import type { WorkItem } from '../types';

/**
 * Actions backing the BlockedQueueView. Parallel in shape to
 * `useReviewerActions` so anyone familiar with the Reviewer hook can read
 * this without context-switching:
 *
 *   - `comments` cache keyed by work-item id (same as Reviewer)
 *   - `loading` map keyed by action+item id (`comment-1`, `unblock-1`,
 *     `resolveComment-12`) so multiple in-flight actions can spin
 *     independently without tangling
 *   - imperative `fetch()` for cache writes — matches the legacy Reviewer
 *     pattern; if we migrate that to react-query later, do this one too
 *
 * Unlike the Reviewer hook, there's no Log Hours / Mark Done / Send Back
 * path — the queue's primary action is Unblock, and per-comment Resolve
 * is exposed via the CommentThread.
 */
interface UseBlockedActionsArgs {
  blockedItems: WorkItem[];
  token: string;
  onTaskUpdate?: (itemId: string, updates: Record<string, unknown>) => void;
}

export function useBlockedActions({ blockedItems, token, onTaskUpdate }: UseBlockedActionsArgs) {
  const [comments, setComments] = useState<Record<string, CommentThreadComment[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const fetchComments = useCallback(
    async (itemId: string) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/comments/workitem/${itemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: CommentThreadComment[] = await res.json();
          setComments((prev) => ({ ...prev, [itemId]: data }));
        }
      } catch (err) {
        console.error('Failed to fetch comments:', err);
      }
    },
    [token],
  );

  // Refetch when the id-set of blocked items changes. Same dep-key pattern
  // as `useReviewerActions` so an equal-count membership swap still loads
  // the newcomer's comments.
  const blockedItemIds = blockedItems.map((item) => item.id).join(',');
  useEffect(() => {
    blockedItems.forEach((item) => {
      fetchComments(item.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set; blockedItems is read fresh each run
  }, [blockedItemIds, fetchComments]);

  const handleAddComment = async (itemId: string, content: string, type: CommentType) => {
    setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/comments/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ work_item_id: parseInt(itemId), content, comment_type: type }),
      });
      if (res.ok) {
        await fetchComments(itemId);
        toast.success('Comment added');
      } else {
        toast.error('Failed to add comment');
      }
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: false }));
    }
  };

  /**
   * Bulk unblock — resolves every unresolved blocker comment on the
   * ticket in a single backend round-trip. Backend gates on
   * `project.tracker_write`. Notifies parent via `onTaskUpdate` so the
   * board cache can drop its `is_blocked=true` flag immediately.
   */
  const handleUnblock = async (itemId: string) => {
    setLoading((prev) => ({ ...prev, [`unblock-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { resolved_count: number };
        if (data.resolved_count > 0) {
          toast.success(
            `Unblocked — resolved ${data.resolved_count} blocker comment${data.resolved_count === 1 ? '' : 's'}`,
          );
        } else {
          toast.success('Ticket was already unblocked');
        }
        // Refresh this item's comments so the BLOCKER pills flip to
        // RESOLVED locally without waiting for the parent's invalidation.
        await fetchComments(itemId);
        onTaskUpdate?.(itemId, { is_blocked: false });
      } else {
        toast.error('Failed to unblock ticket');
      }
    } catch {
      toast.error('Failed to unblock ticket');
    } finally {
      setLoading((prev) => ({ ...prev, [`unblock-${itemId}`]: false }));
    }
  };

  /**
   * Per-comment resolve — surfaced as the "Resolve" pill on each
   * unresolved blocker comment inside the embedded CommentThread.
   * Backend: PATCH /api/comments/{id}/resolve?is_resolved=true.
   */
  const handleResolveComment = async (itemId: string, commentId: number) => {
    const loadingKey = `resolveComment-${commentId}`;
    setLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/comments/${commentId}/resolve?is_resolved=true`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        await fetchComments(itemId);
        toast.success('Blocker comment resolved');
        // Don't optimistically clear is_blocked here — other unresolved
        // blockers may still exist. The next board refetch flips the flag
        // when (and only when) the LAST one is resolved.
        onTaskUpdate?.(itemId, {});
      } else {
        toast.error('Failed to resolve comment');
      }
    } catch {
      toast.error('Failed to resolve comment');
    } finally {
      setLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  return {
    comments,
    loading,
    handleAddComment,
    handleUnblock,
    handleResolveComment,
  };
}
