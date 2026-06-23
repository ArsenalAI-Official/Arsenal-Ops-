import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { CommentThreadComment, CommentType } from '@/components/CommentThread';
import { API_BASE_URL } from '@/config/api';
import type { WorkItem } from '../types';

interface UseReviewerActionsArgs {
  reviewItems: WorkItem[];
  token: string;
  onTaskUpdate?: (itemId: string, updates: Record<string, unknown>) => void;
}

export function useReviewerActions({ reviewItems, token, onTaskUpdate }: UseReviewerActionsArgs) {
  const [comments, setComments] = useState<Record<string, CommentThreadComment[]>>({});
  const [logHoursInput, setLogHoursInput] = useState<Record<string, string>>({});
  const [showLogHours, setShowLogHours] = useState<Record<string, boolean>>({});
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

  // Fetch comments for each review item. Keyed on the SET of item ids (not just
  // the count): an equal-count membership swap — one item leaving review as
  // another enters — must still load the newcomer's comments.
  const reviewItemIds = reviewItems.map((item) => item.id).join(',');
  useEffect(() => {
    reviewItems.forEach((item) => {
      fetchComments(item.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set; reviewItems is read fresh each run
  }, [reviewItemIds, fetchComments]);

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

  const handleLogHours = async (itemId: string) => {
    const hours = parseFloat(logHoursInput[itemId] ?? '');
    if (!hours || hours <= 0) {
      toast.error('Please enter valid hours');
      return;
    }
    setLoading((prev) => ({ ...prev, [`log-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}/log-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hours, description: 'Reviewed and logged' }),
      });
      if (res.ok) {
        setLogHoursInput((prev) => ({ ...prev, [itemId]: '' }));
        setShowLogHours((prev) => ({ ...prev, [itemId]: false }));
        toast.success(`${hours}h logged`);
        onTaskUpdate?.(itemId, {});
      } else {
        toast.error('Failed to log hours');
      }
    } catch {
      toast.error('Failed to log hours');
    } finally {
      setLoading((prev) => ({ ...prev, [`log-${itemId}`]: false }));
    }
  };

  // Generic status mutator used by both reviewer actions (Mark Done / Send
  // Back). Loading keys are per-status so the two buttons spin independently.
  // Backend `PUT /api/workitems/{id}` validates the target (e.g. "subtask still
  // open" blocks marking a parent done); surface those messages verbatim.
  const handleStatusChange = async (
    itemId: string,
    newStatus: 'done' | 'in_progress',
    successMessage: string,
  ) => {
    const loadingKey = `status-${newStatus}-${itemId}`;
    setLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(successMessage);
        onTaskUpdate?.(itemId, { status: newStatus });
      } else {
        let detail = 'Failed to update status';
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          // body wasn't JSON — keep the generic message
        }
        toast.error(detail);
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  return {
    comments,
    logHoursInput,
    setLogHoursInput,
    showLogHours,
    setShowLogHours,
    loading,
    handleAddComment,
    handleLogHours,
    handleStatusChange,
  };
}
