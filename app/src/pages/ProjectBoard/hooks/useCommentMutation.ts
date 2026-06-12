import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { toastErrorHandler } from '@/lib/mutationToast';
import type { WorkItem } from '@/types/workItems';
import type { Project } from './useBoardData';

interface UseCommentMutationArgs {
  // Read fresh each render so a drawer-close race can't snapshot a stale value.
  selectedItem: WorkItem | null;
  project: Project | null;
}

/**
 * Owns the board's submit-comment mutation plus handleSubmitComment. Moved
 * verbatim from the ProjectBoard orchestrator.
 */
export function useCommentMutation({ selectedItem, project }: UseCommentMutationArgs) {
  const queryClient = useQueryClient();

  // Submit comment mutation — captures workItemId in vars so a drawer-close
  // race can't make us invalidate ['workItem', undefined, 'comments'].
  const submitCommentMutation = useMutation({
    mutationFn: ({
      workItemId,
      content,
      authorId,
      commentType,
    }: {
      workItemId: string;
      content: string;
      authorId: number;
      commentType: 'comment' | 'blocker' | 'business_review';
    }) =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(workItemId),
          content,
          author_id: authorId,
          comment_type: commentType,
        }),
      }),
    onSuccess: (_data, { commentType }) => {
      const messages = {
        blocker: 'Blocker reported!',
        business_review: 'Business Review comment added!',
        comment: 'Comment added!',
      } as const;
      toast.success(messages[commentType]);
    },
    onError: toastErrorHandler('add comment'),
    onSettled: (_data, _err, { workItemId }) => {
      queryClient.invalidateQueries({ queryKey: ['workItem', workItemId, 'comments'] });
    },
  });

  const handleSubmitComment = (
    content: string,
    commentType: 'comment' | 'blocker' | 'business_review' = 'comment',
  ) => {
    if (!selectedItem || !content.trim()) return;
    submitCommentMutation.mutate({
      workItemId: selectedItem.id,
      content,
      authorId: project?.developers?.[0]?.id || 1,
      commentType,
    });
  };

  return { submitCommentMutation, handleSubmitComment };
}
