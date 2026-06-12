import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import type { Comment, WorkItem } from '../types';

interface UseReviewerActionsArgs {
  reviewItems: WorkItem[];
  token: string;
  onTaskUpdate?: (itemId: string, updates: any) => void;
}

export function useReviewerActions({ reviewItems, token, onTaskUpdate }: UseReviewerActionsArgs) {
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [logHoursInput, setLogHoursInput] = useState<Record<string, string>>({});
  const [showLogHours, setShowLogHours] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Fetch comments for each review item. Keyed on the SET of item ids (not just
  // the count): an equal-count membership swap — one item leaving review as
  // another enters — must still load the newcomer's comments.
  const reviewItemIds = reviewItems.map((item) => item.id).join(',');
  useEffect(() => {
    reviewItems.forEach((item) => {
      fetchComments(item.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set; fetchComments is a stable fire-and-forget fetch
  }, [reviewItemIds]);

  const fetchComments = async (itemId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/comments/workitem/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => ({ ...prev, [itemId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  };

  const handleAddComment = async (itemId: string) => {
    const content = newComment[itemId]?.trim();
    if (!content) return;

    setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/comments/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          work_item_id: parseInt(itemId),
          content,
        }),
      });

      if (res.ok) {
        setNewComment((prev) => ({ ...prev, [itemId]: '' }));
        await fetchComments(itemId);
        toast.success('Comment added');
      } else {
        toast.error('Failed to add comment');
      }
    } catch (err) {
      toast.error('Failed to add comment');
    } finally {
      setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: false }));
    }
  };

  const handleLogHours = async (itemId: string) => {
    const hours = parseFloat(logHoursInput[itemId]);
    if (!hours || hours <= 0) {
      toast.error('Please enter valid hours');
      return;
    }

    setLoading((prev) => ({ ...prev, [`log-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}/log-hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hours, description: 'Reviewed and logged' }),
      });

      if (res.ok) {
        setLogHoursInput((prev) => ({ ...prev, [itemId]: '' }));
        setShowLogHours((prev) => ({ ...prev, [itemId]: false }));
        toast.success(`${hours}h logged`);
        // Refresh parent
        onTaskUpdate?.(itemId, {});
      } else {
        toast.error('Failed to log hours');
      }
    } catch (err) {
      toast.error('Failed to log hours');
    } finally {
      setLoading((prev) => ({ ...prev, [`log-${itemId}`]: false }));
    }
  };

  const handleMarkDone = async (itemId: string) => {
    setLoading((prev) => ({ ...prev, [`done-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'done' }),
      });

      if (res.ok) {
        toast.success('Marked as done');
        onTaskUpdate?.(itemId, { status: 'done' });
      } else {
        // Surface backend validation messages (e.g. "subtask still open"
        // when marking a parent done) instead of a generic toast.
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
      setLoading((prev) => ({ ...prev, [`done-${itemId}`]: false }));
    }
  };

  return {
    comments,
    newComment,
    setNewComment,
    logHoursInput,
    setLogHoursInput,
    showLogHours,
    setShowLogHours,
    loading,
    handleAddComment,
    handleLogHours,
    handleMarkDone,
  };
}
