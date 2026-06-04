import {
  BookOpen,
  ClipboardList,
  Bug,
  Target,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Inbox,
} from 'lucide-react';

export const TYPE_CONFIG = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: { icon: ClipboardList, color: '#FBBF24', label: 'Subtask', bg: 'rgba(251,191,36,0.15)' },
} as const;

// 4-status workflow (backlog is a sprint-placement state, not a workflow status).
// Sprint Actions handles moving items in/out of backlog.
export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: '#60A5FA', icon: Plus, gradient: 'from-[#60A5FA]/10' },
  in_progress: {
    label: 'In Progress',
    color: '#E0B954',
    icon: Clock,
    gradient: 'from-[#E0B954]/10',
  },
  in_review: {
    label: 'In Review',
    color: '#A78BFA',
    icon: AlertCircle,
    gradient: 'from-[#A78BFA]/10',
  },
  done: { label: 'Done', color: '#34D399', icon: CheckCircle2, gradient: 'from-[#34D399]/10' },
  // backlog kept for read display; not shown as a transition button
  backlog: { label: 'Backlog', color: '#555555', icon: Inbox, gradient: 'from-[#555555]/10' },
} as const;

export const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#737373',
};

// Calendar styling re-used across date-picker popovers
export const CALENDAR_CLASS_NAMES = {
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
