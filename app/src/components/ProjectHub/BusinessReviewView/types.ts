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

export interface Milestone {
  id: number;
  title: string;
  description?: string;
  due_date?: string;
  is_completed: boolean;
}

export interface Sprint {
  id: number;
  name: string;
  status: string;
  completion_pct: number;
  velocity?: number | null;
  total_items: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ProjectAnalytics {
  total_items: number;
  total_story_points: number;
  completed_points: number;
  status_distribution: Record<string, number>;
  velocity_data: { sprint_name: string; committed: number; completed: number }[];
  team_performance: {
    name: string;
    total_items: number;
    completed_items: number;
    total_points: number;
    completed_points: number;
  }[];
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
  analytics: ProjectAnalytics | null;
  sprints: Sprint[];
  milestones: Milestone[];
  workItems: WorkItem[];
}
