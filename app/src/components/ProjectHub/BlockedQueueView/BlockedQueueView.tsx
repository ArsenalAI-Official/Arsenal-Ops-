import { Ban, ShieldCheck } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { useBlockedActions } from './hooks/useBlockedActions';
import BlockedItemCard from './sections/BlockedItemCard';
import type { BlockedQueueViewProps, WorkItem } from './types';

/**
 * Renders a list of tickets the server flagged as `is_blocked=true`
 * (i.e. they have ≥1 unresolved blocker comment). Mirrors ReviewerView's
 * shape so the two tabs in the panel feel like siblings.
 *
 * The filter happens here, not in the parent, for the same reason
 * ReviewerView filters to `in_review` locally: the panel passes every
 * visible board item and each tab narrows to its own concern.
 */
const BlockedQueueView: React.FC<BlockedQueueViewProps> = ({
  workItems,
  projectId: _projectId,
  token,
  onTaskUpdate,
  allDevelopers = [],
}) => {
  const blockedItems: WorkItem[] = workItems.filter((item) => !!item.is_blocked);

  const { comments, loading, handleAddComment, handleUnblock, handleResolveComment } =
    useBlockedActions({ blockedItems, token, onTaskUpdate });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Mirrors the per-comment resolve tracking inside <CommentThread>:
  // surface the comment-id currently being resolved so the spinner lands
  // on the right pill. Loading keys are `resolveComment-<id>`; pluck the
  // first one we find (only one resolve at a time per item card in
  // practice, since the user has to click each pill individually).
  const resolvingCommentIdFor = (itemId: string): number | null => {
    const itemComments = comments[itemId] ?? [];
    for (const c of itemComments) {
      if (loading[`resolveComment-${c.id}`]) return c.id;
    }
    return null;
  };

  if (blockedItems.length === 0) {
    return (
      <Empty className="border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-[rgba(52,211,153,0.1)]">
            <ShieldCheck className="text-[#34D399]" />
          </EmptyMedia>
          <EmptyTitle className="text-white">No blocked tickets</EmptyTitle>
          <EmptyDescription>
            Tickets flagged with an unresolved <span className="text-[#a3a3a3]">blocker</span>{' '}
            comment will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header — matches ReviewerView's layout for visual parity
          between the two tabs. */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center">
          <Ban className="w-4 h-4 text-[#EF4444]" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white">Blocked Queue</h2>
          <p className="text-[11px] text-[#737373]">Tickets with unresolved blocker comments</p>
        </div>
        <Badge className="bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]">
          {blockedItems.length}
        </Badge>
      </div>

      {blockedItems.map((item) => (
        <BlockedItemCard
          key={item.id}
          item={item}
          comments={comments[item.id]}
          allDevelopers={allDevelopers}
          commentLoading={!!loading[`comment-${item.id}`]}
          unblockLoading={!!loading[`unblock-${item.id}`]}
          resolvingCommentId={resolvingCommentIdFor(item.id)}
          onAddComment={(content, type) => handleAddComment(item.id, content, type)}
          onUnblock={() => handleUnblock(item.id)}
          onResolveComment={(commentId) => handleResolveComment(item.id, commentId)}
          formatDate={formatDate}
        />
      ))}
    </div>
  );
};

export default BlockedQueueView;
