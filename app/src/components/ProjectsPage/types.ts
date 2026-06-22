import type {
  DeveloperResponse,
  MyTaskResponse,
  PersonalTaskResponse,
  ProjectDetailResponse,
} from '@/client';

export type Developer = DeveloperResponse;

export type Project = ProjectDetailResponse;

// Genuine FE-composition: the backend my-tasks response PLUS a frontend-only
// `is_personal` flag (MyTasksBox merges personal tasks into the my-tasks list).
export type MyTask = MyTaskResponse & { is_personal?: boolean };

export type PersonalTask = PersonalTaskResponse;

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
