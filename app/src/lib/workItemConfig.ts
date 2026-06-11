// Canonical work-item type / status / priority configuration. Previously this
// was copy-pasted into ~7 files (KanbanCard, ProjectBoard, AIPlanningModal,
// ListView, TimelineView, the two constants.ts files, etc.) with values that had
// drifted (epic color, "done" color, critical/high priority swap). This is the
// single source of truth.
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
  backlog: { label: 'Backlog', color: '#555555', icon: Inbox, gradient: 'from-[#555555]/10' },
} as const;

export const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#737373',
};

export type WorkItemTypeKey = keyof typeof TYPE_CONFIG;
export type StatusKey = keyof typeof STATUS_CONFIG;

/** Status → display color, falling back to the backlog grey for unknowns. */
export function getStatusColor(status: string): string {
  return STATUS_CONFIG[status as StatusKey]?.color ?? STATUS_CONFIG.backlog.color;
}

/** Status → human label, falling back to the raw key. */
export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as StatusKey]?.label ?? status;
}

/** Priority → display color, falling back to the low/grey colour. */
export function getPriorityColor(priority: string): string {
  return PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.low;
}
