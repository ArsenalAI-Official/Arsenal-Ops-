// Domain types + shared presentation helpers for the Employees tab.
// Co-located here so the orchestrator, filter bar, capacity overview, and the
// capacity table all reference one definition (CONVENTIONS rule 6).
import type { EmployeeResponse } from '@/client';

export interface CapacityTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string | null;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  started_at: string | null;
  last_assigned_at: string | null;
  completed_at: string | null;
  counted_hours: number;
  counted_basis: string;
  your_logged_this_week?: number;
}

// A synced Google Calendar meeting contributing to weekly capacity.
// (Duplicated in MyCapacityCard — there's no shared types module yet; see
// app/CLAUDE.md. TODO(audit-FT1))
export interface CapacityMeeting {
  title: string;
  // Project parsed from the title's `project_name-purpose` convention, or null
  // when it doesn't follow it / the event is private. Optional so a cached
  // payload from before this field existed degrades to "untagged".
  project?: string | null;
  start_at: string | null;
  end_at: string | null;
  hours: number;
}

export interface DeveloperCapacity {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  avatar_url: string | null;
  project_count: number;
  this_week_in_progress_hours: number;
  this_week_in_review_hours: number;
  this_week_done_hours: number;
  this_week_meeting_hours: number;
  this_week_capacity_used: number;
  this_week_remaining_capacity: number;
  week_start?: string;
  week_end?: string;
  tickets?: CapacityTicket[];
  meetings?: CapacityMeeting[];
  specialization: string | null;
}

export interface TeamCapacity {
  perDev: Array<{
    id: number;
    name: string;
    inProgress: number;
    inReview: number;
    done: number;
    used: number;
    remaining: number;
    utilization: number;
    status: 'Available' | 'Moderate' | 'Busy';
  }>;
  totalCapacity: number;
  totalUsed: number;
  totalInProgress: number;
  totalInReview: number;
  totalDone: number;
  totalRemaining: number;
  counts: Record<'Available' | 'Moderate' | 'Busy', number>;
  utilization: number;
  weekStart?: string;
  weekEnd?: string;
}

export type EmployeeStatusFilter = 'all' | 'Available' | 'Moderate' | 'Busy';

export type EmployeeSortKey = 'name' | 'projects' | 'assigned' | 'capacity';

export interface EmployeeSort {
  key: EmployeeSortKey;
  dir: 'asc' | 'desc';
}

/** A pre-computed capacity-augmented employee row (search/filter/sort input). */
export interface EmployeeRow {
  emp: EmployeeResponse;
  used: number;
  inProgress: number;
  inReview: number;
  done: number;
  remaining: number;
  status: 'Available' | 'Moderate' | 'Busy';
}

export const PROJECT_COLOR_PALETTE = [
  '#E0B954',
  '#A78BFA',
  '#34D399',
  '#60A5FA',
  '#F97316',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#94A3B8',
  '#EF4444',
];

export const projectColor = (projectId: number) =>
  PROJECT_COLOR_PALETTE[Math.abs(projectId) % PROJECT_COLOR_PALETTE.length];

// Meetings render in a distinct slate that's deliberately outside the project
// palette, so the meeting segment never reads as "another project".
export const MEETING_COLOR = '#64748B';

export const statusBadgeColor = (status: string) => {
  if (status === 'in_progress') return '#E0B954';
  if (status === 'in_review') return '#A78BFA';
  if (status === 'done') return '#34D399';
  if (status === 'blocked') return '#EF4444';
  return '#737373';
};

export const WEEKLY_CAPACITY_HRS = 40;
