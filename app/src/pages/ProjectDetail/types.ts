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
  GoalResponse,
  MilestoneResponse,
  ActivityResponse,
  ProjectAnalyticsResponse,
  ProjectLinkResponse,
  SprintResponse,
  PrdAnalysisResponse,
  ProjectDetailResponse,
} from '@/client';

// The Architecture / PRDAnalysis / detail-Project shapes that used to live here
// now map 1:1 onto generated backend response types and are consumed directly
// from '@/client': ProjectArchitectureResponse, PrdAnalysisResponse,
// ProjectDetailResponse. The backend models were tightened so the generator
// emits the nested cost/tool/risk/timeline shapes the UI reads. (Detail Project
// previously also carried `architectures[]`, which ProjectDetailResponse
// deliberately omits — nothing in ProjectDetail read it, so it's gone.)

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
  project: ProjectDetailResponse;
  sprints: SprintResponse[];
  goals: GoalResponse[];
  milestones: MilestoneResponse[];
  activities: ActivityResponse[];
  analytics: ProjectAnalyticsResponse;
  prdAnalysis: PrdAnalysisResponse;
  links: ProjectLinkResponse[];
}
