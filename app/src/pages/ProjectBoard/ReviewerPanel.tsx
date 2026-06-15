import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, X } from 'lucide-react';
import { ReviewerView } from '@/components/ProjectHub';
import { apiFetch } from '@/lib/api';
import type { CommentThreadDeveloper } from '@/components/CommentThread';

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
}

export interface ReviewerPanelProps {
  workItems: WorkItemIn[];
  projectId: string;
  token: string;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTaskUpdate: (itemId: string, updates: any) => void;
}

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
            <div className="w-9 h-9 rounded-xl bg-[rgba(224,185,84,0.1)] flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#E0B954]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Review Queue</h2>
              <p className="text-xs text-[#737373]">
                Approve, comment, or send back items pending review
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ReviewerView
            workItems={workItems.map((item) => ({
              ...item,
              assignee_id: item.assignee_id ?? undefined,
              sprint_id: item.sprint_id ?? undefined,
              parent_id: item.parent_id ?? undefined,
              epic_id: item.epic_id ?? undefined,
              due_date: item.due_date ?? undefined,
              estimated_hours: item.estimated_hours ?? undefined,
            }))}
            projectId={projectId}
            token={token}
            onTaskUpdate={onTaskUpdate}
            allDevelopers={allDevelopers}
          />
        </div>
      </div>
    </>
  );
};

export default ReviewerPanel;
