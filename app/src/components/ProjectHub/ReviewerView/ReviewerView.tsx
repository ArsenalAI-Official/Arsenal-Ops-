import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Eye, Inbox } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import type { ReviewerViewProps, WorkItem } from './types';
import { useReviewerActions } from './hooks/useReviewerActions';
import ReviewItemCard from './sections/ReviewItemCard';

const ReviewerView: React.FC<ReviewerViewProps> = ({
  workItems,
  projectId: _projectId,
  token,
  onTaskUpdate,
  allDevelopers = [],
}) => {
  const { user } = useAuth();
  // Only the ticket's assignee can log hours (matches backend enforcement).
  // ReviewerView has no project-developer list to map email→developer id, so we
  // compare by display name. Fragile in edge cases (renames, duplicates) but the
  // backend rejects mismatches with 403 anyway — this is just UI hide.
  const isAssigneeOf = (item: WorkItem) =>
    !!user?.name && !!item.assignee && user.name === item.assignee;

  // Filter to in_review items only
  const reviewItems = workItems.filter((item) => item.status === 'in_review');

  const {
    comments,
    logHoursInput,
    setLogHoursInput,
    showLogHours,
    setShowLogHours,
    loading,
    handleAddComment,
    handleLogHours,
    handleStatusChange,
  } = useReviewerActions({ reviewItems, token, onTaskUpdate });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (reviewItems.length === 0) {
    return (
      <Empty className="border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-[rgba(224,185,84,0.1)]">
            <Inbox className="text-[#E0B954]" />
          </EmptyMedia>
          <EmptyTitle className="text-white">Review queue is empty</EmptyTitle>
          <EmptyDescription>
            Items moved to <span className="text-[#a3a3a3]">In&nbsp;Review</span> will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header — outside the card list so it stays sticky-feeling while
          users scroll a long queue. */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-8 h-8 rounded-xl bg-[rgba(224,185,84,0.1)] flex items-center justify-center">
          <Eye className="w-4 h-4 text-[#E0B954]" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white">Review Queue</h2>
          <p className="text-[11px] text-[#737373]">Items awaiting your review</p>
        </div>
        <Badge className="bg-[rgba(224,185,84,0.15)] text-[#E0B954] border border-[rgba(224,185,84,0.3)]">
          {reviewItems.length}
        </Badge>
      </div>

      {reviewItems.map((item) => (
        <ReviewItemCard
          key={item.id}
          item={item}
          isAssignee={isAssigneeOf(item)}
          comments={comments[item.id]}
          allDevelopers={allDevelopers}
          logHoursInput={logHoursInput[item.id] || ''}
          onChangeLogHoursInput={(value) =>
            setLogHoursInput((prev) => ({ ...prev, [item.id]: value }))
          }
          showLogHours={!!showLogHours[item.id]}
          onToggleLogHours={() =>
            setShowLogHours((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
          }
          onCancelLogHours={() => setShowLogHours((prev) => ({ ...prev, [item.id]: false }))}
          commentLoading={!!loading[`comment-${item.id}`]}
          logLoading={!!loading[`log-${item.id}`]}
          doneLoading={!!loading[`status-done-${item.id}`]}
          sendBackLoading={!!loading[`status-in_progress-${item.id}`]}
          onAddComment={(content, type) => handleAddComment(item.id, content, type)}
          onLogHours={() => handleLogHours(item.id)}
          onMarkDone={() => handleStatusChange(item.id, 'done', 'Marked as done')}
          onSendBack={() => handleStatusChange(item.id, 'in_progress', 'Moved back to In Progress')}
          formatDate={formatDate}
        />
      ))}
    </div>
  );
};

export default ReviewerView;
