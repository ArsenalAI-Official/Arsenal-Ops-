export interface WorkItem {
  id: string;
  key: string;
  type: 'user_story' | 'task' | 'bug' | 'epic' | 'subtask';
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  assigned_hours: number;
  remaining_hours: number;
  logged_hours: number;
  story_points: number;
  priority: 'high' | 'medium' | 'low' | 'critical';
  assignee: string;
  assignee_id: number | null;
  reporter_name?: string | null;
  sprint: string;
  sprint_id: number | null;
  product_id: string;
  project_id?: number;
  tags: string[];
  epic: string;
  parent_id?: number | null;
  epic_id?: number | null;
  parent_key?: string | null;
  epic_key?: string | null;
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  estimated_hours?: number | null;
}

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
