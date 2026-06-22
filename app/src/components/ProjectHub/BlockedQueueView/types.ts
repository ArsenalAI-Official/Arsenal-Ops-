import type { CommentThreadDeveloper } from '@/components/CommentThread';
// Re-uses the same WorkItem shape as the Review queue — they're rendered side
// by side in the same panel, so the underlying record is identical.
import type { WorkItem } from '../ReviewerView/types';

export type { WorkItem };

export interface BlockedQueueViewProps {
  workItems: WorkItem[];
  projectId: string;
  token: string;
  /** Called after a status / unblock mutation lands so the parent can keep
   *  its cache in sync (mirrors the ReviewerView callback). */
  onTaskUpdate?: (itemId: string, updates: Record<string, unknown>) => void;
  /** Project developer roster — drives the @mention picker inside
   *  CommentThread. Optional; empty array = picker shows "no match". */
  allDevelopers?: CommentThreadDeveloper[];
}
