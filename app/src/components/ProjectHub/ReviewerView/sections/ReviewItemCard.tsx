import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Clock, CheckCircle2, MessageSquare, Send, User, Calendar, Clock3 } from 'lucide-react';
import { PRIORITY_COLOR } from '@/lib/workItemConfig';
import { Spinner } from '@/components/ui/spinner';
import type { Comment, WorkItem } from '../types';

interface ReviewItemCardProps {
  item: WorkItem;
  isAssignee: boolean;
  comments: Comment[] | undefined;
  newComment: string;
  onChangeNewComment: (value: string) => void;
  logHoursInput: string;
  onChangeLogHoursInput: (value: string) => void;
  showLogHours: boolean;
  onToggleLogHours: () => void;
  onCancelLogHours: () => void;
  commentLoading: boolean;
  logLoading: boolean;
  doneLoading: boolean;
  onAddComment: () => void;
  onLogHours: () => void;
  onMarkDone: () => void;
  formatDate: (dateStr?: string) => string;
}

const ReviewItemCard: React.FC<ReviewItemCardProps> = ({
  item,
  isAssignee,
  comments,
  newComment,
  onChangeNewComment,
  logHoursInput,
  onChangeLogHoursInput,
  showLogHours,
  onToggleLogHours,
  onCancelLogHours,
  commentLoading,
  logLoading,
  doneLoading,
  onAddComment,
  onLogHours,
  onMarkDone,
  formatDate,
}) => {
  return (
    <div className="bg-[#0A0A14] rounded-lg p-4 border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.08)] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#C79E3B] font-mono text-sm">{item.key}</span>
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                borderColor: PRIORITY_COLOR[item.priority] || '#737373',
                color: PRIORITY_COLOR[item.priority] || '#737373',
              }}
            >
              {item.priority}
            </Badge>
          </div>
          <h3 className="text-white font-medium">{item.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {isAssignee && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLogHours}
              className="text-[#737373] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
            >
              <Clock className="w-4 h-4 mr-1" />
              Log Time
            </Button>
          )}
          <Button
            size="sm"
            onClick={onMarkDone}
            disabled={doneLoading}
            className="bg-[#E0B954] hover:bg-[#C79E3B] text-white"
          >
            {doneLoading ? (
              <Spinner size="xs" tone="white" className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1" />
            )}
            Mark Done
          </Button>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-[#737373] mb-3">
        <div className="flex items-center gap-1">
          <User className="w-3.5 h-3.5" />
          {item.assignee || 'Unassigned'}
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(item.due_date)}
        </div>
        <div className="flex items-center gap-1">
          <Clock3 className="w-3.5 h-3.5" />
          {item.estimated_hours || 0}h est / {item.logged_hours || 0}h logged
        </div>
      </div>

      {/* Log Hours Input — only renders when the toggle is on AND user is assignee */}
      {showLogHours && isAssignee && (
        <div className="flex items-center gap-2 mb-3 p-3 bg-[#0d0d0d] rounded-lg">
          <Input
            type="number"
            placeholder="Hours"
            min="0.5"
            step="0.5"
            className="w-24 bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            value={logHoursInput || ''}
            onChange={(e) => onChangeLogHoursInput(e.target.value)}
          />
          <Button
            size="sm"
            onClick={onLogHours}
            disabled={logLoading}
            className="bg-[#F59E0B] hover:bg-[#D97706] text-white"
          >
            {logLoading ? <Spinner size="xs" tone="white" className="w-4 h-4" /> : 'Log'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelLogHours} className="text-[#737373]">
            Cancel
          </Button>
        </div>
      )}

      {/* Comments Section */}
      <div className="border-t border-[rgba(255,255,255,0.05)] pt-3">
        <div className="flex items-center gap-2 mb-2 text-sm text-[#737373]">
          <MessageSquare className="w-4 h-4" />
          Comments ({comments?.length || 0})
        </div>

        {/* Comment List */}
        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
          {comments?.map((comment) => (
            <div key={comment.id} className="bg-[#0d0d0d] rounded p-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#C79E3B] font-medium">{comment.author_name}</span>
                <span className="text-[#737373] text-xs">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-[#d4d4d4]">{comment.content}</p>
            </div>
          ))}
          {!comments?.length && <p className="text-[#737373] text-sm italic">No comments yet</p>}
        </div>

        {/* Add Comment */}
        <div className="flex items-start gap-2">
          <Textarea
            placeholder="Add a review comment..."
            className="flex-1 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white text-sm min-h-[60px] resize-none"
            value={newComment || ''}
            onChange={(e) => onChangeNewComment(e.target.value)}
          />
          <Button
            size="sm"
            onClick={onAddComment}
            disabled={commentLoading || !newComment?.trim()}
            className="bg-[#E0B954] hover:bg-[#B8872A] text-white h-[60px]"
          >
            {commentLoading ? (
              <Spinner size="xs" tone="white" className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReviewItemCard;
