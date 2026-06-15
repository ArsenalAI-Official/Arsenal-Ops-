/**
 * Shared admin-domain types.
 *
 * Extracted from AdminDashboard.tsx so the shell, tabs, containers, and
 * per-domain hooks all reference one definition instead of redeclaring the
 * same shapes. (See the broader "no shared types module" audit note in
 * app/CLAUDE.md — this is the admin slice of that fix.)
 */

export interface User {
  id: number;
  email: string;
  name: string;
  role: string; // Comma-separated roles
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
  github_username?: string | null;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  total_items: number;
  done_items: number;
  completion_pct: number;
  developer_count: number;
  github_repo_url: string | null;
  github_repo_urls?: string[];
  github_repo_name: string | null;
  has_github_token: boolean;
  // Category surface — flat fields populated by GET /api/admin/projects.
  // null when the project hasn't been assigned to any category.
  category_id: number | null;
  category_name: string | null;
}

export interface DashboardStats {
  total_employees: number;
  total_projects: number;
  total_tickets: number;
  active_sprints: number;
  tickets_by_status: Record<string, number>;
  tickets_by_priority: Record<string, number>;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  capability_keys: string[];
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectWeeklyReportRow {
  project_id: number;
  project_name: string;
  category_id: number | null;
  category_name: string | null;
  todo_backlog: number;
  in_progress: number;
  in_review: number;
  done_this_week: number;
}

export interface ProjectWeeklyReport {
  week_start: string;
  week_end: string;
  rows: ProjectWeeklyReportRow[];
}

export interface Capability {
  key: string;
  description: string;
}

export type AdminTab = 'dashboard' | 'employees' | 'projects' | 'time_entries' | 'users' | 'roles';

// Re-export the types owned by their component modules so downstream consumers
// have a single `./types` import surface for everything admin.
export type { ProjectCategory, CategoryFormPayload } from './modals/CategoryManagerModal';
export type { Employee, DeveloperCapacity } from './tabs/EmployeesTab';
