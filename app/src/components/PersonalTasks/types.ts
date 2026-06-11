export interface PersonalTask {
  id: number;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  due_date?: string;
  tags: string[];
  is_converted: boolean;
  project_id?: number;
  work_item_id?: number;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  key_prefix: string;
}

export interface NewTaskForm {
  title: string;
  description: string;
  priority: string;
  due_date: string;
  project_id: string;
  estimated_hours: string;
}

export interface EditTaskForm {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  due_date: string;
}

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'done':
      return 'bg-green-500/20 text-green-400';
    case 'in_progress':
      return 'bg-yellow-500/20 text-yellow-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical':
      return 'bg-red-500/20 text-red-400';
    case 'high':
      return 'bg-orange-500/20 text-orange-400';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
};

export const PERSONAL_TASK_CALENDAR_CLASS_NAMES = {
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
  head_cell: 'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
  row: 'flex w-full gap-1',
  cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
  day: 'h-8 w-8 p-0 font-normal',
  day_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
  day_selected: 'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
  day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
  day_outside: 'text-[#444]',
  day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
  day_range_middle: 'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
  day_hidden: 'invisible',
};
