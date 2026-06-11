import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
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
  } = useReviewerActions({ reviewItems, token, onTaskUpdate });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (reviewItems.length === 0) {
    return (
      <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-[#C79E3B]" />
            Review Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Eye className="text-[#737373]" />
              </EmptyMedia>
              <EmptyTitle className="text-[#737373]">No items in review</EmptyTitle>
              <EmptyDescription>Items marked "In Review" will appear here</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-[#C79E3B]" />
          Review Queue
          <Badge className="bg-[#C79E3B]/20 text-[#C79E3B] border-[#C79E3B]/30">
            {reviewItems.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewItems.map((item) => (
          <ReviewItemCard
            key={item.id}
            item={item}
            isAssignee={isAssigneeOf(item)}
            comments={comments[item.id]}
            newComment={newComment[item.id] || ''}
            onChangeNewComment={(value) => setNewComment((prev) => ({ ...prev, [item.id]: value }))}
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
            doneLoading={!!loading[`done-${item.id}`]}
            onAddComment={() => handleAddComment(item.id)}
            onLogHours={() => handleLogHours(item.id)}
            onMarkDone={() => handleMarkDone(item.id)}
            formatDate={formatDate}
          />
        ))}
      </CardContent>
    </Card>
  );
};

export default ReviewerView;
