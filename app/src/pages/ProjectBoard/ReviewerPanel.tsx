import { useQuery } from '@tanstack/react-query';
import { Eye, X, Ban } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkItemUpdate } from '@/client';
import type { CommentThreadDeveloper } from '@/components/CommentThread';
import { ReviewerView, BlockedQueueView } from '@/components/ProjectHub';
import { apiFetch } from '@/lib/api';

interface WorkItemIn {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number | null;
  sprint_id?: number | null;
  parent_id?: number | null;
  epic_id?: number | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  logged_hours?: number;
  remaining_hours?: number;
  /** Server-computed: true when ≥1 unresolved blocker comment exists.
   *  Drives the Blocked-queue tab and its count badge. */
  is_blocked?: boolean;
}

export interface ReviewerPanelProps {
  workItems: WorkItemIn[];
  projectId: string;
  token: string;
  onClose: () => void;
  onTaskUpdate: (itemId: string, updates: WorkItemUpdate) => void;
}

type QueueTab = 'review' | 'blocked';

const ReviewerPanel = ({
  workItems,
  projectId,
  token,
  onClose,
  onTaskUpdate,
}: ReviewerPanelProps) => {
  // Developer roster — drives the @mention picker inside CommentThread.
  // Reuses the existing `['developers']` query key so cache is shared with
  // any sibling page that's already loaded the list (free hit).
  const developersQuery = useQuery<CommentThreadDeveloper[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch<CommentThreadDeveloper[]>('/api/developers/'),
  });
  const allDevelopers = developersQuery.data ?? [];

  // Active tab — defaults to Review since that's the panel's primary
  // historic purpose. Blocked is a sibling queue surfaced as a tab so we
  // don't add another toolbar button.
  const [activeTab, setActiveTab] = useState<QueueTab>('review');

  // Map the panel's WorkItemIn shape into the shape both views expect.
  // The mapping was duplicated when there was only one view; pulling it
  // out keeps the two consumers consistent (same id/sprint coercions,
  // same `is_blocked` passthrough).
  const mappedItems = useMemo(
    () =>
      workItems.map((item) => ({
        ...item,
        assignee_id: item.assignee_id ?? undefined,
        sprint_id: item.sprint_id ?? undefined,
        parent_id: item.parent_id ?? undefined,
        epic_id: item.epic_id ?? undefined,
        due_date: item.due_date ?? undefined,
        estimated_hours: item.estimated_hours ?? undefined,
        is_blocked: item.is_blocked,
      })),
    [workItems],
  );

  // Pre-compute the per-tab counts shown on the tab triggers. Driven off
  // the same data the views filter from so the counts can never diverge
  // from "what's actually inside each tab".
  const reviewCount = mappedItems.filter((item) => item.status === 'in_review').length;
  const blockedCount = mappedItems.filter((item) => !!item.is_blocked).length;

  // Escape-to-close. Mounted only while the panel itself is mounted (the
  // parent already controls visibility via `showReviewer`), so the
  // listener tears down cleanly when the user closes via any path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Click-outside backdrop. Sits one z-layer below the panel so clicks
          on the panel land on the panel, not the backdrop. Light dim
          (bg-black/40) signals "panel is active" without obscuring the
          board behind it. Esc-to-close is also wired below for keyboard
          users — pure additive convenience, not required by the
          click-outside contract. */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      {/* Wider slide-in: 720px on desktops, capped at 92vw on small viewports so
        the panel never overflows. Was 480px — too tight for the new card
        layout + the mention picker which needs horizontal space for names. */}
      <div
        className="fixed inset-y-0 right-0 w-[720px] max-w-[92vw] bg-[#080808] border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-label="Review Queue"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[rgba(255,255,255,0.12)] flex items-center justify-center">
              {activeTab === 'review' ? (
                <Eye className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Ban className="w-4 h-4 text-[#EF4444]" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {activeTab === 'review' ? 'Review Queue' : 'Blocked Queue'}
              </h2>
              <p className="text-xs text-[#737373]">
                {activeTab === 'review'
                  ? 'Approve, comment, or send back items pending review'
                  : 'Resolve blockers to clear tickets'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white transition-colors"
            aria-label="Close review panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab strip — switches between Review and Blocked queues without
            adding another toolbar button. Active tab gets the gold/red
            underline matching the icon color theme used inside the view.
            role="tablist" + aria-selected per WAI-ARIA so screen readers
            announce the switch. */}
        <div
          role="tablist"
          aria-label="Queue type"
          className="flex border-b border-[rgba(255,255,255,0.05)] flex-shrink-0 px-6"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'review'}
            onClick={() => setActiveTab('review')}
            className={`relative px-3 py-2.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === 'review' ? 'text-brand' : 'text-[#737373] hover:text-[#a3a3a3]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            In Review
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold ${
                activeTab === 'review'
                  ? 'bg-[rgba(224,185,84,0.2)] text-brand'
                  : 'bg-[rgba(255,255,255,0.05)] text-[#737373]'
              }`}
            >
              {reviewCount}
            </span>
            {activeTab === 'review' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'blocked'}
            onClick={() => setActiveTab('blocked')}
            className={`relative px-3 py-2.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === 'blocked' ? 'text-[#EF4444]' : 'text-[#737373] hover:text-[#a3a3a3]'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            Blocked
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold ${
                activeTab === 'blocked'
                  ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]'
                  : 'bg-[rgba(255,255,255,0.05)] text-[#737373]'
              }`}
            >
              {blockedCount}
            </span>
            {activeTab === 'blocked' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#EF4444]" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'review' ? (
            <ReviewerView
              workItems={mappedItems}
              projectId={projectId}
              token={token}
              onTaskUpdate={onTaskUpdate}
              allDevelopers={allDevelopers}
            />
          ) : (
            <BlockedQueueView
              workItems={mappedItems}
              projectId={projectId}
              token={token}
              onTaskUpdate={onTaskUpdate}
              allDevelopers={allDevelopers}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default ReviewerPanel;
