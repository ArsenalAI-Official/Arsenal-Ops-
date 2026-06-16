import type { SprintResponse } from '@/client';

export interface PMViewProps {
  projectId: string;
  token: string;
  sprints?: SprintResponse[];
}

export interface HoursAnalytics {
  project_name: string;
  total_allocated_hours: number;
  total_logged_hours: number;
  total_remaining_hours: number;
  sprint_hours: SprintHours[];
  developer_hours: DeveloperHours[];
  weekly_hours: WeeklyHours[];
}

export interface SprintHours {
  sprint_id: number;
  sprint_name: string;
  status: string;
  allocated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  total_items: number;
}

export interface TimeEntry {
  hours: number;
  logged_at: string;
  is_this_week: boolean;
  description?: string;
}

export interface TicketBreakdown {
  ticket_id: number;
  key: string;
  title: string;
  status: string;
  estimated_hours: number;
  total_logged_on_ticket: number;
  my_logged_hours: number;
  remaining_hours: number;
  time_entries: TimeEntry[];
}

export interface HoursOnOthersTicket {
  ticket_key: string;
  ticket_title: string;
  ticket_assignee: string;
  hours: number;
  logged_at: string;
}

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
}

export interface DeveloperHours {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  role: string;
  allocated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  current_week_logged: number;
  total_items: number;
  completed_items: number;
  done_logged_hours?: number;
  weekly_logged_history?: Array<{ week_start: string; week_end: string; hours: number }>;
  my_tickets: TicketBreakdown[];
  hours_logged_on_others_tickets: HoursOnOthersTicket[];
  attribution_note: string;
  // Sat-Fri capacity breakdown for THIS project (matches admin capacity rules)
  week_start?: string;
  week_end?: string;
  this_week_in_progress_hours?: number;
  this_week_in_review_hours?: number;
  this_week_done_hours?: number;
  this_week_capacity_used?: number;
  this_week_remaining_capacity?: number;
  this_week_tickets?: CapacityTicket[];
}

export interface WeeklyHours {
  week: string;
  week_end: string;
  week_label: string;
  allocated_hours: number;
  logged_hours: number;
  items_completed: number;
}
