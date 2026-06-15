import type { CommentThreadComment, CommentThreadDeveloper } from '@/components/CommentThread';

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
}

// The Reviewer queue renders comments via the shared <CommentThread>, so it
// reuses that component's comment shape rather than declaring its own.
export type ReviewComment = CommentThreadComment;

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
