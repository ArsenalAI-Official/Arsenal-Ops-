/**
 * Shared project-detail domain types.
 *
 * Extracted from ProjectDetail.tsx so the orchestrator, its data hook, tabs,
 * sections, and header all reference one definition instead of redeclaring the
 * same shapes. (See the broader "no shared types module" audit note F-T1 in
 * .plans/split-monolithic-frontend-*.md — this is the project-detail slice of
 * that fix, mirroring the precedent set by AdminDashboard/types.ts.)
 */

import type {
  ProjectDeveloperEntry,
  GoalResponse,
  MilestoneResponse,
  ActivityResponse,
  ProjectAnalyticsResponse,
  ProjectLinkResponse,
} from '@/client';

export interface Architecture {
  id: number;
  name: string;
  description: string;
  architecture_type: string;
  mermaid_code: string;
  pros: string[];
  cons: string[];
  estimated_cost: string;
  complexity: string;
  time_to_implement: string;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
  cost_analysis?: {
    infrastructure?: {
      monthly: string;
      annual: string;
      breakdown: { item: string; cost: string }[];
    };
    development?: { total: string; breakdown: { item: string; cost: string }[] };
    total_estimated?: string;
  };
  tools_recommended?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    devops?: string[];
    [key: string]: string[] | undefined;
  };
}

export interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis?: {
    infrastructure?: {
      monthly: string;
      annual: string;
      breakdown: { item: string; cost: string }[];
    };
    development?: { total: string; breakdown: { item: string; cost: string }[] };
    total_estimated?: string;
  };
  recommended_tools?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    devops?: string[];
    [key: string]: string[] | undefined;
  };
  risks: { risk: string; impact: string; mitigation: string }[];
  timeline: { phase: string; duration: string; tasks: string[] }[];
}

export interface Sprint {
  id: number;
  name: string;
  goal: string;
  status: 'planned' | 'active' | 'completed';
  start_date?: string;
  end_date?: string;
  capacity_hours: number;
  velocity: number;
  total_items: number;
  todo_count: number;
  in_progress_count: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  completion_pct: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  github_repo_url: string;
  github_repo_urls?: string[];
  github_repo_name?: string;
  created_at: string;
  end_date?: string;
  developers?: ProjectDeveloperEntry[];
  selected_architecture?: Architecture;
  architectures: Architecture[];
}

export type TabType =
  | 'overview'
  | 'hub'
  | 'tracker'
  | 'calendar'
  | 'pulse'
  | 'pulse_settings'
  | 'goals'
  | 'activity'
  | 'project_manager';

export interface HubWorkItem {
  id: string;
  key: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  start_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
  sprint?: string;
  story_points?: number;
}

// Shape returned by GET /api/projects/{id}/overview — bundles 8 previously
// separate hub queries into one round trip. Individual useQuery hooks are
// kept as fallback (for cache priming + invalidation routing), but the
// overview query primes their caches so they short-circuit on first paint.
export interface ProjectOverview {
  project: Project;
  sprints: Sprint[];
  goals: GoalResponse[];
  milestones: MilestoneResponse[];
  activities: ActivityResponse[];
  analytics: ProjectAnalyticsResponse;
  prdAnalysis: PRDAnalysis;
  links: ProjectLinkResponse[];
}
