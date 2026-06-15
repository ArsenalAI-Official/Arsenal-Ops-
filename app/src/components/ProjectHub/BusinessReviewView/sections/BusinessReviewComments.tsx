import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, MessageSquare, ExternalLink, ChevronDown, Circle } from 'lucide-react';
import type { BusinessReviewComment } from '../types';

interface BusinessReviewCommentsProps {
  comments: BusinessReviewComment[];
  projectId: string | number;
  onToggleResolved: (commentId: number, currentStatus: boolean) => void;
}

const renderTextWithNewlines = (text: string) => {
  if (!text) return null;
  return text
    .split('\n')
    .map((line, index) => [
      <span key={`line-${index}`}>{line}</span>,
      index < text.split('\n').length - 1 ? <br key={`br-${index}`} /> : null,
    ])
    .flat()
    .filter(Boolean);
};

const BusinessReviewComments: React.FC<BusinessReviewCommentsProps> = ({
  comments,
  projectId,
  onToggleResolved,
}) => {
  const navigate = useNavigate();
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [isBusinessReviewExpanded, setIsBusinessReviewExpanded] = useState(true);

  const toggleCommentExpanded = (commentId: number) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId);
    } else {
      newExpanded.add(commentId);
    }
    setExpandedComments(newExpanded);
  };

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-[#A78BFA]" />
        </div>
        <h3 className="text-sm font-semibold text-white">Business Review Comments</h3>
        {comments.length > 0 && (
          <Badge className="bg-[#A78BFA]/20 text-[#A78BFA] border-0 ml-auto">
            {comments.length}
          </Badge>
        )}
        {comments.length > 0 && (
          <button
            onClick={() => setIsBusinessReviewExpanded(!isBusinessReviewExpanded)}
            className="p-1 hover:bg-[rgba(167,139,250,0.1)] rounded-lg transition-colors"
            title={isBusinessReviewExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown
              className={`w-5 h-5 text-[#A78BFA] transition-transform ${isBusinessReviewExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>
      {comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-[#737373] mx-auto mb-3" />
          <p className="text-sm text-[#737373]">No comments yet</p>
        </div>
      ) : (
        isBusinessReviewExpanded && (
          <>
            <div className="space-y-4">
              {comments.slice(0, 10).map((comment) => {
                const isExpanded = expandedComments.has(comment.id);
                const isLongContent = comment.content.length > 150;
                const displayContent = isExpanded
                  ? comment.content
                  : comment.content.substring(0, 150);

                return (
                  <div
                    key={comment.id}
                    className={`rounded-xl p-4 ${comment.is_resolved ? 'bg-[rgba(52,211,153,0.05)] border border-[rgba(52,211,153,0.2)]' : 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${comment.is_resolved ? 'bg-[rgba(52,211,153,0.2)] text-[#34D399]' : 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'}`}
                          >
                            {comment.author_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm font-medium text-[#f5f5f5]">
                            {comment.author_name}
                          </span>
                          <span className="text-xs text-[#737373]">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                          {comment.is_resolved && (
                            <span className="ml-auto px-2 py-0.5 rounded-md bg-[rgba(52,211,153,0.2)] text-[#34D399] text-[10px] font-medium">
                              RESOLVED
                            </span>
                          )}
                        </div>
                        <a
                          onClick={() =>
                            navigate(`/project/${projectId}/board/${comment.work_item_id}`)
                          }
                          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] transition-colors text-xs font-medium mb-2 cursor-pointer"
                        >
                          <span className="font-mono">{comment.work_item_key}</span>
                          <span className="truncate">{comment.work_item_title}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={() => onToggleResolved(comment.id, comment.is_resolved)}
                          className={`p-1.5 rounded-lg transition-colors ${comment.is_resolved ? 'hover:bg-[rgba(52,211,153,0.1)] text-[#34D399]' : 'hover:bg-[rgba(167,139,250,0.1)] text-[#A78BFA]'}`}
                          title={comment.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                        >
                          {comment.is_resolved ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </button>
                        {isLongContent && (
                          <button
                            onClick={() => toggleCommentExpanded(comment.id)}
                            className="ml-2 p-1 hover:bg-[rgba(167,139,250,0.1)] rounded-lg transition-colors flex-shrink-0"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <ChevronDown
                              className={`w-4 h-4 text-[#A78BFA] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">
                      {renderTextWithNewlines(displayContent)}
                      {!isExpanded && isLongContent && <span className="text-[#737373]">...</span>}
                    </p>
                  </div>
                );
              })}
            </div>
            {comments.length > 10 && (
              <div className="mt-4 text-center">
                <p className="text-xs text-[#737373]">Showing 10 of {comments.length} comments</p>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
};

export default BusinessReviewComments;
