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
  { key: 'done', color: '#34D399', label: 'Done' },
  { key: 'in_progress', color: '#E0B954', label: 'In Progress' },
  { key: 'in_review', color: '#A78BFA', label: 'In Review' },
  { key: 'todo', color: '#60A5FA', label: 'To Do' },
] as const;

export const STATUS_COLOR: Record<string, string> = {
  todo: '#60A5FA',
  in_progress: '#E0B954',
  in_review: '#A78BFA',
  done: '#34D399',
  blocked: '#EF4444',
  backlog: '#555',
};

export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: '#60A5FA', icon: Plus },
  in_progress: { label: 'In Progress', color: '#E0B954', icon: Clock },
  in_review: { label: 'In Review', color: '#A78BFA', icon: AlertCircle },
  done: { label: 'Done', color: '#34D399', icon: CheckCircle2 },
} as const;

export const TASK_TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string; bg: string }
> = {
  user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: {
    icon: ClipboardList,
    color: '#FBBF24',
    label: 'Subtask',
    bg: 'rgba(251,191,36,0.15)',
  },
};

// Calendar styling shared across date picker popovers — identical to the shared
// module, re-exported so existing importers keep working.
export { CALENDAR_CLASS_NAMES } from '@/lib/calendarClassNames';
