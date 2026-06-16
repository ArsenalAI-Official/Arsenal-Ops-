import type { MilestoneResponse, ProjectAnalyticsResponse, SprintResponse } from '@/client';

export interface WorkItem {
  id: string;
  key: string;
  title?: string;
  type: string;
  status: string;
  priority: string;
  assignee?: string;
  due_date?: string;
}

export interface BusinessReviewComment {
  id: number;
  comment_id: number;
  work_item_id: number;
  work_item_key: string;
  work_item_title: string;
  author_id: number | null;
  author_name: string;
  content: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  mentions: number[];
}

export interface BusinessReviewViewProps {
  project: any;
  analytics: ProjectAnalyticsResponse | null;
  sprints: SprintResponse[];
  milestones: MilestoneResponse[];
  workItems: WorkItem[];
}
