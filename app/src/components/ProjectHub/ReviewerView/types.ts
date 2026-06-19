import type { CommentThreadDeveloper } from '@/components/CommentThread';

export interface WorkItem {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
  /** Server-computed: true when the ticket has ≥1 unresolved blocker
   *  comment. Used by sibling BlockedQueueView; ReviewerView ignores it. */
  is_blocked?: boolean;
}

export interface ReviewerViewProps {
  workItems: WorkItem[];
  projectId: string;
  token: string;
  onTaskUpdate?: (itemId: string, updates: Record<string, unknown>) => void;
  /** Project developer roster used by the @mention picker. Optional — when
   *  absent (legacy callers), the picker shows "No matching developers" and
   *  the rest of the comment UX still works. */
  allDevelopers?: CommentThreadDeveloper[];
}
