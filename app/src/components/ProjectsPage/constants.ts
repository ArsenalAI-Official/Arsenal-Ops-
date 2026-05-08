import {
    BookOpen,
    ClipboardList,
    Bug,
    Target,
    Plus,
    Clock,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';

export const STATUS_BARS = [
    { key: 'done',        color: '#34D399', label: 'Done' },
    { key: 'in_progress', color: '#E0B954', label: 'In Progress' },
    { key: 'in_review',   color: '#A78BFA', label: 'In Review' },
    { key: 'todo',        color: '#60A5FA', label: 'To Do' },
] as const;

export const STATUS_COLOR: Record<string, string> = {
    todo:        '#60A5FA',
    in_progress: '#E0B954',
    in_review:   '#A78BFA',
    done:        '#34D399',
    blocked:     '#EF4444',
    backlog:     '#555',
};

export const STATUS_CONFIG = {
    todo: { label: 'To Do', color: '#60A5FA', icon: Plus },
    in_progress: { label: 'In Progress', color: '#E0B954', icon: Clock },
    in_review: { label: 'In Review', color: '#A78BFA', icon: AlertCircle },
    done: { label: 'Done', color: '#34D399', icon: CheckCircle2 },
} as const;

export const TASK_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string; bg: string }> = {
    user_story: { icon: BookOpen,     color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
    task:       { icon: ClipboardList, color: '#F59E0B', label: 'Task',  bg: 'rgba(245,158,11,0.15)' },
    bug:        { icon: Bug,           color: '#EF4444', label: 'Bug',   bg: 'rgba(239,68,68,0.15)'  },
    epic:       { icon: Target,        color: '#A78BFA', label: 'Epic',  bg: 'rgba(167,139,250,0.15)' },
};

// Calendar styling shared across date picker popovers in ProjectsPage dialogs
export const CALENDAR_CLASS_NAMES = {
    months: "flex flex-col",
    month: "space-y-4",
    caption: "flex justify-between items-center px-0 pb-4 relative h-7 mb-2",
    caption_label: "text-sm font-medium text-white",
    nav: "space-x-1 flex items-center",
    nav_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1",
    nav_button_previous: "absolute left-0",
    nav_button_next: "absolute right-0",
    table: "w-full border-collapse space-y-1",
    head_row: "flex",
    head_cell: "text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded",
    row: "flex w-full gap-1",
    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent",
    day: "h-8 w-8 p-0 font-normal",
    day_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors",
    day_selected: "bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold",
    day_today: "bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold",
    day_outside: "text-[#444]",
    day_disabled: "text-[#333] opacity-50 cursor-not-allowed",
    day_range_middle: "aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white",
    day_hidden: "invisible",
};
