import { useMemo, useState } from 'react';
import { Send, MessageSquare, AlertCircle, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Rich comment thread used by WorkItemPanel and the Reviewer queue.
 *
 * Owned by the component:
 *   - newComment text + textarea focus
 *   - @mention picker (showMentions, mentionFilter, insertMention)
 *
 * Owned by the parent (passed via props):
 *   - comments list — fetched + cached upstream
 *   - allDevelopers — drives the mention picker
 *   - submit lifecycle — parent owns the mutation so it can invalidate the
 *     right react-query keys + apply optimistic updates
 *
 * The split keeps the component decoupled from any specific endpoint or
 * cache shape. The same component drops into the work-item side panel
 * (which invalidates ['workItem', id, 'comments']) and the Reviewer queue
 * (which invalidates a different key).
 *
 * Backend behaviour: `POST /api/comments/` parses `@Name` patterns in the
 * content and stores the resolved developer IDs in `comment.mentions`.
 * The renderer below highlights both `@Name` (gold pill) and URLs
 * (clickable link) inline.
 */

export type CommentType = 'comment' | 'blocker' | 'business_review';

export interface CommentThreadComment {
  id: number;
  content: string;
  author_name: string;
  comment_type?: CommentType;
  mentions?: number[];
  created_at: string;
}

export interface CommentThreadDeveloper {
  id: number;
  name: string;
  email: string;
}

interface CommentThreadProps {
  comments: CommentThreadComment[];
  allDevelopers: CommentThreadDeveloper[];
  isPosting: boolean;
  onSubmit: (content: string, type: CommentType) => void;
  /**
   * `full` exposes all three comment types (Comment / Blocker / Business
   * Review) — matches the work-item side panel.
   * `simple` shows a single Send button — matches the Reviewer queue where
   * tagging a comment as a "blocker" wouldn't make sense (item is already
   * in-review).
   */
  variant?: 'full' | 'simple';
  /** Optional placeholder override (defaults to a hint about @mentions). */
  placeholder?: string;
  /** Cap the comment list height; default 256px. Pass `0` to render
   *  unbounded (e.g. inside an already-scrollable container). */
  listMaxHeightPx?: number;
}

/**
 * Inline render helper: replaces `@DevName` tokens with gold pills (when
 * the dev id is in `mentions`) and `https?://...` URLs with clickable
 * links. Pure — extracted from WorkItemPanel so both consumers render
 * comment bodies identically.
 */
function renderCommentContent(
  content: string,
  mentions: number[] = [],
  devMap: Map<number, string>,
) {
  let result = content;
  mentions.forEach((devId) => {
    const devName = devMap.get(devId);
    if (devName) {
      const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      result = result.replace(regex, `<<<M_${devId}>>>`);
    }
  });
  const urls: string[] = [];
  result = result.replace(/(https?:\/\/[^\s]+)/g, (m) => {
    urls.push(m);
    return `<<<U_${urls.length - 1}>>>`;
  });
  const parts = result.split(/(<<<M_\d+>>>|<<<U_\d+>>>)/g);
  let idx = 0;
  return parts.flatMap((part) => {
    const mm = part.match(/<<<M_(\d+)>>>/);
    if (mm) {
      return (
        <span
          key={`m-${idx++}`}
          className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium"
        >
          @{devMap.get(parseInt(mm[1]))}
        </span>
      );
    }
    const um = part.match(/<<<U_(\d+)>>>/);
    if (um) {
      const url = urls[parseInt(um[1])];
      return (
        <a
          key={`u-${idx++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all"
        >
          {url}
        </a>
      );
    }
    return part
      .split('\n')
      .flatMap((line, li, arr) => [
        <span key={`t-${idx}-${li}`}>{line}</span>,
        li < arr.length - 1 ? <br key={`tb-${idx}-${li}`} /> : null,
      ])
      .filter(Boolean);
  });
}

const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  allDevelopers,
  isPosting,
  onSubmit,
  variant = 'full',
  placeholder = 'Add a comment… Use @ to mention someone',
  listMaxHeightPx = 256,
}) => {
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  // Stable map for the comment-body renderer. Recomputed only when the
  // developer roster reference changes.
  const devMap = useMemo(
    () => new Map(allDevelopers.map((d) => [d.id, d.name] as const)),
    [allDevelopers],
  );

  // Filter mention candidates by the typed-after-@ substring. Cap at 5 so
  // the popover stays compact; "no match" message handles the empty case.
  const matchingDevelopers = useMemo(
    () =>
      allDevelopers
        .filter((d) => d.name.toLowerCase().includes(mentionFilter.toLowerCase()))
        .slice(0, 5),
    [allDevelopers, mentionFilter],
  );

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);
    // Mention picker opens when the cursor is in an `@`-prefixed token
    // (no whitespace between the @ and the caret). Matches the
    // pre-existing WorkItemPanel behaviour exactly.
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1) {
      const after = value.substring(lastAt + 1);
      if (!after.includes(' ')) {
        setMentionFilter(after);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (dev: CommentThreadDeveloper) => {
    const lastAt = newComment.lastIndexOf('@');
    setNewComment(`${newComment.substring(0, lastAt)}@${dev.name} `);
    setShowMentions(false);
    setMentionFilter('');
  };

  const handleSubmit = (type: CommentType) => {
    if (!newComment.trim() || isPosting) return;
    onSubmit(newComment, type);
    // Parent's onSuccess is expected to clear via re-render of `comments`,
    // but we clear local input optimistically so the typing experience
    // feels instant. If the post fails, parent will surface a toast; the
    // unsent text would already be gone, which is acceptable here because
    // the comment-thread isn't a high-stakes write surface.
    setNewComment('');
    setShowMentions(false);
    setMentionFilter('');
  };

  const submitDisabled = !newComment.trim() || isPosting;

  return (
    <div>
      {/* Input + mention picker */}
      <div className="relative mb-4">
        <Textarea
          value={newComment}
          onChange={handleCommentChange}
          placeholder={placeholder}
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
        />
        {showMentions && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1D26] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
            {matchingDevelopers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[#737373]">No matching developers</div>
            ) : (
              matchingDevelopers.map((dev) => (
                <button
                  key={dev.id}
                  type="button"
                  onClick={() => insertMention(dev)}
                  className="w-full px-3 py-2 text-left text-sm text-[#f5f5f5] hover:bg-[rgba(224,185,84,0.1)] flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-xs text-[#E0B954]">
                    {dev.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{dev.name}</span>
                  <span className="text-[#737373] text-xs ml-auto">{dev.email}</span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          {variant === 'full' ? (
            <>
              <Button
                size="sm"
                onClick={() => handleSubmit('comment')}
                disabled={submitDisabled}
                className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8"
              >
                <MessageSquare className="w-3 h-3 mr-1" /> Comment
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmit('blocker')}
                disabled={submitDisabled}
                className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.2)] rounded-lg text-xs h-8"
              >
                <AlertCircle className="w-3 h-3 mr-1" /> Report Blocker
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmit('business_review')}
                disabled={submitDisabled}
                className="bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)] rounded-lg text-xs h-8"
              >
                <Target className="w-3 h-3 mr-1" /> Business Review
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => handleSubmit('comment')}
              disabled={submitDisabled}
              className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8"
            >
              <Send className="w-3 h-3 mr-1" /> Post comment
            </Button>
          )}
        </div>
      </div>

      {/* Comment list. `listMaxHeightPx === 0` means "render unbounded" —
          useful when the parent already provides scrolling (Reviewer's
          per-card collapsible). */}
      <div
        className="space-y-3 overflow-y-auto"
        style={listMaxHeightPx > 0 ? { maxHeight: `${listMaxHeightPx}px` } : undefined}
      >
        {comments.length === 0 ? (
          <div className="text-center py-6 text-[#737373] text-sm">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          comments.map((comment) => {
            const isBlocker = comment.comment_type === 'blocker';
            const isBusinessReview = comment.comment_type === 'business_review';
            return (
              <div
                key={comment.id}
                className={`p-3 rounded-xl ${
                  isBlocker
                    ? 'bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)]'
                    : isBusinessReview
                      ? 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'
                      : 'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      isBlocker
                        ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]'
                        : isBusinessReview
                          ? 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'
                          : 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]'
                    }`}
                  >
                    {comment.author_name?.charAt?.(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm font-medium text-[#f5f5f5]">{comment.author_name}</span>
                  {isBlocker && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[rgba(239,68,68,0.2)] text-[#EF4444] text-[10px] font-medium">
                      BLOCKER
                    </span>
                  )}
                  {isBusinessReview && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[rgba(167,139,250,0.2)] text-[#A78BFA] text-[10px] font-medium">
                      BUSINESS REVIEW
                    </span>
                  )}
                  <span className="text-xs text-[#737373] ml-auto">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-[#a3a3a3] leading-relaxed">
                  {renderCommentContent(comment.content, comment.mentions, devMap)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CommentThread;
