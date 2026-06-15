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
  counted_hours: number;
  counted_basis: string;
  your_logged_this_week: number;
}

export interface MyCapacityResponse {
  developer_id: number;
  developer_name: string;
  week_start: string;
  week_end: string;
  this_week_in_progress_hours: number;
  this_week_in_review_hours: number;
  this_week_done_hours: number;
  this_week_capacity_used: number;
  this_week_remaining_capacity: number;
  tickets: CapacityTicket[];
}

export interface ProjectGroup {
  projectId: number;
  projectName: string;
  tickets: CapacityTicket[];
  total: number;
}

export const WEEKLY_CAPACITY = 40;

const PROJECT_COLOR_PALETTE = [
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

export const statusBadgeColor = (status: string) => {
  if (status === 'in_progress') return '#E0B954';
  if (status === 'in_review') return '#A78BFA';
  if (status === 'done') return '#34D399';
  if (status === 'blocked') return '#EF4444';
  return '#737373';
};
