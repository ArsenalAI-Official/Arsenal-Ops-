import { MessageSquare, User, Calendar, Clock3, ShieldCheck, Ban } from 'lucide-react';
import React from 'react';
import CommentThread, {
  type CommentThreadComment,
  type CommentThreadDeveloper,
  type CommentType,
} from '@/components/CommentThread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { PRIORITY_COLOR, STATUS_CONFIG } from '@/lib/workItemConfig';
import type { WorkItem } from '../types';

interface BlockedItemCardProps {
  item: WorkItem;
  comments: CommentThreadComment[] | undefined;
  allDevelopers: CommentThreadDeveloper[];
  commentLoading: boolean;
  unblockLoading: boolean;
  resolvingCommentId: number | null;
  onAddComment: (content: string, type: CommentType) => void;
  onUnblock: () => void;
  onResolveComment: (commentId: number) => void;
  formatDate: (dateStr?: string) => string;
}

/**
 * One row in the BlockedQueueView. Mirrors ReviewItemCard's structure so
 * the two queues feel like siblings, but trades the reviewer-specific
 * actions (Log time / Mark done / Move to In Progress) for the single
 * "Unblock" path.
 *
 * What changes vs. ReviewItemCard:
 *   - Status pill in the title row (blocked items can be in ANY status,
 *     so it isn't redundant the way it would be on the in_review queue)
 *   - Red `Blocked` chip beside the key
 *   - "Unblock" as the only primary action — green CTA
 *   - CommentThread's per-comment `Resolve` is wired through so the user
 *     can clear blockers one at a time without nuking them all
 */
const BlockedItemCard: React.FC<BlockedItemCardProps> = ({
  item,
  comments,
  allDevelopers,
  commentLoading,
  unblockLoading,
  resolvingCommentId,
  onAddComment,
  onUnblock,
  onResolveComment,
  formatDate,
}) => {
  const { can } = useAuth();
  // Unblock + per-comment Resolve both gate on `project.tracker_write`
  // (mirrors the backend's POST /unblock guard). Read-only viewers can
  // still browse the queue and read the blocker comments.
  const canWriteTracker = can('project.tracker_write');

  const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG];

  return (
    <div className="rounded-2xl border border-[rgba(239,68,68,0.15)] bg-[rgba(239,68,68,0.03)] hover:border-[rgba(239,68,68,0.3)] transition-colors p-4 space-y-3">
      {/* Title row — key + Blocked chip + priority + (optional) status pill
          + Unblock action. Mirrors ReviewItemCard rhythm. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-mono font-semibold text-muted-foreground">
              {item.key}
            </span>
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]"
              title="This ticket has unresolved blocker comments"
            >
              <Ban className="w-2.5 h-2.5" />
              Blocked
            </span>
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
            {statusConfig && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider px-1.5 py-0 h-5"
                style={{ borderColor: statusConfig.color, color: statusConfig.color }}
              >
                {statusConfig.label}
              </Badge>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canWriteTracker && (
            <Button
              size="sm"
              onClick={onUnblock}
              disabled={unblockLoading}
              className="h-8 text-xs bg-[#34D399] hover:bg-[#10B981] text-[#080808] font-semibold rounded-lg disabled:opacity-60"
            >
              {unblockLoading ? (
                <Spinner size="xs" tone="white" />
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Unblock
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Meta strip — same shape as ReviewItemCard for parity. */}
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

      {/* Comments — same CommentThread the rest of the app uses. The
          per-comment Resolve pill is rendered automatically for unresolved
          blocker comments when `onResolveComment` is provided. */}
      <div className="pt-2.5 border-t border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold uppercase tracking-wider text-progress">
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
          onSubmit={(content, type) => onAddComment(content, type)}
          variant="simple"
          placeholder="Add a comment… Use @ to mention someone"
          listMaxHeightPx={240}
          // Per-comment Resolve gated on the same write cap as the
          // top-level Unblock button. Hidden entirely when the user
          // lacks the cap.
          onResolveComment={canWriteTracker ? onResolveComment : undefined}
          resolvingCommentId={resolvingCommentId}
        />
      </div>
    </div>
  );
};

export default BlockedItemCard;
