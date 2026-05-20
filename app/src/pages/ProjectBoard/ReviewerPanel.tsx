import { Eye, X } from 'lucide-react';
import { ReviewerView } from '@/components/ProjectHub';

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
  return (
    <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-[#080808] border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E0B954]/10 flex items-center justify-center">
            <Eye className="w-4 h-4 text-[#E0B954]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Review Queue</h2>
            <p className="text-xs text-[#737373]">Items pending review</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
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
        />
      </div>
    </div>
  );
};

export default ReviewerPanel;
