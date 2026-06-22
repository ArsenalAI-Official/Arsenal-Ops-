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
  critical: { color: '#EF4444', label: 'Critical' },
  high: { color: '#F97316', label: 'High' },
  medium: { color: '#F59E0B', label: 'Medium' },
  low: { color: '#737373', label: 'Low' },
};

export const DUE_DATE_CALENDAR_CLASS_NAMES = {
  months: 'flex flex-col',
  month: 'space-y-4',
  caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
  caption_label: 'text-sm font-medium text-white',
  nav: 'space-x-1 flex items-center',
  nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
  nav_button_previous: 'absolute left-0',
  nav_button_next: 'absolute right-0',
  table: 'w-full border-collapse space-y-1',
  head_row: 'flex',
  head_cell: 'text-white rounded-md w-9 font-normal text-[0.8rem]',
  row: 'flex w-full mt-2',
  cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-900/20 [&:has([aria-selected])]:bg-slate-900 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
  day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md text-white hover:bg-[rgba(224,185,84,0.2)]',
  day_range_end: 'day-range-end',
  day_selected:
    'bg-[#E0B954] text-black hover:bg-[#E0B954] hover:text-black focus:bg-[#E0B954] focus:text-black',
  day_today: 'bg-[rgba(224,185,84,0.2)] text-white',
  day_outside:
    'day-outside text-slate-500 aria-selected:bg-slate-900/20 aria-selected:text-slate-400',
  day_disabled: 'text-slate-500',
  day_range_middle: 'aria-selected:bg-slate-900 aria-selected:text-white',
};
