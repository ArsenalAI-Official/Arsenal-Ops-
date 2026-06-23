import { Clock, CheckCircle2, MessageSquare, User, Calendar, Clock3, Undo2 } from 'lucide-react';
import React from 'react';
import CommentThread, {
  type CommentThreadComment,
  type CommentThreadDeveloper,
  type CommentType,
} from '@/components/CommentThread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PRIORITY_COLOR } from '@/lib/workItemConfig';
import type { WorkItem } from '../types';

interface ReviewItemCardProps {
  item: WorkItem;
  isAssignee: boolean;
  comments: CommentThreadComment[] | undefined;
  allDevelopers: CommentThreadDeveloper[];
  logHoursInput: string;
  onChangeLogHoursInput: (value: string) => void;
  showLogHours: boolean;
  onToggleLogHours: () => void;
  onCancelLogHours: () => void;
  commentLoading: boolean;
  logLoading: boolean;
  doneLoading: boolean;
  sendBackLoading: boolean;
  onAddComment: (content: string, type: CommentType) => void;
  onLogHours: () => void;
  onMarkDone: () => void;
  onSendBack: () => void;
  formatDate: (dateStr?: string) => string;
}

const ReviewItemCard: React.FC<ReviewItemCardProps> = ({
  item,
  isAssignee,
  comments,
  allDevelopers,
  logHoursInput,
  onChangeLogHoursInput,
  showLogHours,
  onToggleLogHours,
  onCancelLogHours,
  commentLoading,
  logLoading,
  doneLoading,
  sendBackLoading,
  onAddComment,
  onLogHours,
  onMarkDone,
  onSendBack,
  formatDate,
}) => {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(224,185,84,0.25)] transition-colors p-4 space-y-3">
      {/* Title row — ticket key + priority chip + title, plus right-aligned
          primary actions. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-mono font-semibold text-[#E0B954]">{item.key}</span>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider px-1.5 py-0 h-5"
              style={{
                borderColor: PRIORITY_COLOR[item.priority] || '#737373',
                color: PRIORITY_COLOR[item.priority] || '#737373',
              }}
            >
              {item.priority}
            </Badge>
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAssignee && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLogHours}
              className="h-8 text-xs text-[#737373] hover:text-[#F59E0B] hover:bg-[rgba(245,158,11,0.1)] rounded-lg"
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              Log time
            </Button>
          )}
          {/* Send back to In Progress — reviewer rejection path. Ghost variant
              so Mark Done stays the visual primary; its own loading key keeps
              it from spinning when Mark Done is in flight. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSendBack}
            disabled={sendBackLoading}
            className="h-8 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.06)] rounded-lg disabled:opacity-60"
          >
            {sendBackLoading ? (
              <Spinner size="xs" tone="white" />
            ) : (
              <>
                <Undo2 className="w-3.5 h-3.5 mr-1" />
                Move to In Progress
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={onMarkDone}
            disabled={doneLoading}
            className="h-8 text-xs bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-semibold rounded-lg disabled:opacity-60"
          >
            {doneLoading ? (
              <Spinner size="xs" tone="white" />
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Mark done
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Meta strip — assignee · due · hours. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#a3a3a3]">
        <span className="inline-flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-[#737373]" />
          <span className="text-[#f5f5f5]">{item.assignee || 'Unassigned'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[#737373]" />
          {formatDate(item.due_date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="w-3.5 h-3.5 text-[#737373]" />
          <span className="font-mono tabular-nums">
            {item.logged_hours || 0}h<span className="text-[#525252]"> / </span>
            {item.estimated_hours || 0}h
          </span>
          <span className="text-[#525252] text-[10px] uppercase tracking-wider">
            logged / estimated
          </span>
        </span>
      </div>

      {/* Log Hours input — only renders when the toggle is on AND user is the
          assignee. */}
      {showLogHours && isAssignee && (
        <div className="flex items-center gap-2 p-3 bg-[rgba(245,158,11,0.04)] border border-[rgba(245,158,11,0.18)] rounded-xl">
          <Input
            type="number"
            placeholder="Hours"
            min="0.5"
            step="0.5"
            className="w-24 h-8 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] text-sm rounded-lg"
            value={logHoursInput || ''}
            onChange={(e) => onChangeLogHoursInput(e.target.value)}
          />
          <Button
            size="sm"
            onClick={onLogHours}
            disabled={logLoading}
            className="h-8 text-xs bg-[#F59E0B] hover:bg-[#D97706] text-white rounded-lg disabled:opacity-60"
          >
            {logLoading ? <Spinner size="xs" tone="white" /> : 'Log'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelLogHours}
            className="h-8 text-xs text-[#737373] hover:text-white rounded-lg"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Comments — shared CommentThread (variant 'simple': single Send, no
          blocker/business-review chips since the item is already in review). */}
      <div className="pt-2.5 border-t border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#8A8A8A]">
          <MessageSquare className="w-3.5 h-3.5" />
          Comments
          <span className="text-[#525252] normal-case tracking-normal font-normal">
            ({comments?.length || 0})
          </span>
        </div>
        <CommentThread
          comments={comments || []}
          allDevelopers={allDevelopers}
          isPosting={commentLoading}
          onSubmit={onAddComment}
          variant="simple"
          placeholder="Add a review comment… Use @ to mention someone"
          listMaxHeightPx={240}
        />
      </div>
    </div>
  );
};

export default ReviewItemCard;
