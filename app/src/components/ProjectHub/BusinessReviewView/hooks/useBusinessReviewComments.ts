import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import type { BusinessReviewComment } from '../types';

export function useBusinessReviewComments(projectId: string | number | undefined) {
  const { token } = useAuth();
  const [businessReviewComments, setBusinessReviewComments] = useState<BusinessReviewComment[]>([]);

  // Fetch business review comments on mount
  useEffect(() => {
    const fetchBusinessReviewComments = async () => {
      if (!projectId) return;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/comments/project/${projectId}/business-review`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.ok) {
          const comments = await response.json();
          setBusinessReviewComments(comments);
        }
      } catch (error) {
        console.error('Failed to fetch business review comments:', error);
      }
    };

    fetchBusinessReviewComments();
  }, [projectId, token]);

  const toggleCommentResolved = async (commentId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/comments/${commentId}/resolve?is_resolved=${!currentStatus}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        // Update the local state
        setBusinessReviewComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, is_resolved: !currentStatus } : c)),
        );
      }
    } catch (error) {
      console.error('Failed to update comment resolved status:', error);
    }
  };

  return { businessReviewComments, toggleCommentResolved };
}
