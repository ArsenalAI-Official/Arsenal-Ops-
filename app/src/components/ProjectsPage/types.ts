export interface ProjectStats {
  total: number;
  by_status: Record<string, number>;
  total_points: number;
  completed: number;
  completion_pct: number;
}

export interface Developer {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  avatar_url?: string;
}

export interface ProjectDeveloper {
  id: number;
  name: string;
  email: string;
  role: string;
  responsibilities?: string;
  is_admin: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  github_repo_url?: string;
  github_repo_urls?: string[];
  github_repo_name?: string;
  created_at: string;
  work_item_stats: ProjectStats;
  developers: ProjectDeveloper[];
}

export interface MyTask {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string;
  due_date: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  logged_hours: number | null;
  remaining_hours: number | null;
  is_overdue: boolean;
  story_points?: number;
  assigned_hours?: number;
  assignee?: string;
  assignee_id?: number | null;
  reporter_name?: string | null;
  description?: string;
  tags?: string[];
  acceptance_criteria?: string[];
  parent_id?: number | null;
  epic_id?: number | null;
  sprint_id?: number | null;
  sprint?: string;
  parent_key?: string | null;
  epic_key?: string | null;
  is_personal?: boolean;
}

export interface PersonalTask {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimated_hours: number;
  due_date?: string;
  tags: string[];
  is_converted: boolean;
  project_id?: number;
  work_item_id?: number;
}

export interface Comment {
  id: number;
  work_item_id: number;
  author_id: number;
  author_name: string;
  content: string;
  comment_type: 'comment' | 'blocker' | 'business_review';
  mentions: number[];
  created_at: string;
}

export interface ProjectMember {
  id: number;
  name: string;
  email: string;
}

export interface NewPersonalTaskForm {
  title: string;
  description: string;
  priority: string;
  due_date: string;
  project_id: string;
  assignee_developer_id: string;
  estimated_hours: string;
}

export interface EditPersonalTaskForm {
  title: string;
  description: string;
  priority: string;
  due_date: string;
}

export interface CreateProjectForm {
  name: string;
  description: string;
  github_repo_url: string;
  /** Category to assign on create. `null` (or omitted) means uncategorized.
   *  Backend POST /api/projects/ already accepts this field. */
  category_id: number | null;
}

export interface SelectedDeveloper {
  developer_id: number;
  role: string;
  responsibilities: string;
}
