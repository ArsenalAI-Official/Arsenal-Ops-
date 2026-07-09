import type { DeveloperResponse, PersonalTaskResponse } from '@/client';

export type PersonalTask = PersonalTaskResponse;

export interface ProjectSummary {
  id: number;
  name: string;
}

export type Developer = DeveloperResponse;

export interface ProjectDetailResponse {
  developers?: Developer[];
}

export interface NewTaskForm {
  title: string;
  description: string;
  priority: string;
  due_date: string;
  project_id: string;
  estimated_hours: string;
}

export const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: '#E5484D', label: 'Critical' },
  high: { color: '#EC7A3C', label: 'High' },
  medium: { color: '#94A3B8', label: 'Medium' },
  low: { color: '#64748B', label: 'Low' },
};

// Only the keys react-day-picker (v9/v10) recognizes are kept; the old v8-era
// keys were no-ops under v9 and are omitted rather than remapped, so the popover
// keeps rendering exactly as before.
export const DUE_DATE_CALENDAR_CLASS_NAMES = {
  months: 'flex flex-col',
  month: 'space-y-4',
  caption_label: 'text-sm font-medium text-white',
  nav: 'space-x-1 flex items-center',
  day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md text-white hover:bg-[rgba(255,255,255,0.08)]',
};
