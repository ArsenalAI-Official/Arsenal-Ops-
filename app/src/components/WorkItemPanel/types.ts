// Canonical work-item type now lives in `@/types/workItems` (audit F-T1). This
// re-export keeps existing `@/components/WorkItemPanel` importers working; the
// canonical shape is a superset (it additionally carries `completed_at`).
export type { WorkItem } from '@/types/workItems';

export interface Sprint {
  id: number;
  name: string;
  status: string;
}

export interface AllDeveloper {
  id: number;
  name: string;
  email: string;
}

export interface ProjectDeveloper {
  id: number;
  name: string;
  email: string;
  role: string;
  github_username?: string;
  responsibilities?: string;
  is_admin?: boolean;
}

export interface ProjectLite {
  developers?: ProjectDeveloper[];
}

export interface Comment {
  id: number;
  content: string;
  author_name: string;
  author_id: number;
  comment_type: 'comment' | 'blocker' | 'business_review';
  mentions?: number[];
  created_at: string;
}
