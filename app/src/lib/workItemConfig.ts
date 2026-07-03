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
  user_story: { icon: BookOpen, color: '#A6A29C', label: 'Story', bg: 'rgba(166,162,156,0.15)' },
  task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
  bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
  epic: { icon: Target, color: '#A78BFA', label: 'Epic', bg: 'rgba(167,139,250,0.15)' },
  subtask: { icon: ClipboardList, color: '#FBBF24', label: 'Subtask', bg: 'rgba(251,191,36,0.15)' },
} as const;

// 4-status workflow (backlog is a sprint-placement state, not a workflow status).
// Colors follow Style Guide 1a — a cool workflow ramp; gold is brand-only, so
// in_progress is purple, not gold. Mirrors --status-* in src/index.css.
export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: '#3B82F6', icon: Plus, gradient: 'from-[#3B82F6]/10' },
  in_progress: {
    label: 'In Progress',
    color: '#6E62E6',
    icon: Clock,
    gradient: 'from-[#6E62E6]/10',
  },
  in_review: {
    label: 'In Review',
    color: '#D06BB0',
    icon: AlertCircle,
    gradient: 'from-[#D06BB0]/10',
  },
  done: { label: 'Done', color: '#40BE86', icon: CheckCircle2, gradient: 'from-[#40BE86]/10' },
  backlog: { label: 'Backlog', color: '#64748B', icon: Inbox, gradient: 'from-[#64748B]/10' },
} as const;

// Warm severity ramp (Style Guide 1a). Low/medium stay muted grey so only
// high/critical draw the eye; critical shares the danger-red with Blocked.
export const PRIORITY_COLOR: Record<string, string> = {
  critical: '#E5484D',
  high: '#EC7A3C',
  medium: '#94A3B8',
  low: '#64748B',
};

/**
 * Richer priority styling (Tailwind border/text/bg classes + hex) for surfaces
 * that need more than the bare hex — e.g. the board's list/epic priority pills.
 * `hex` is kept consistent with PRIORITY_COLOR above.
 */
export interface PriorityStyle {
  border: string;
  text: string;
  bg: string;
  hex: string;
}

export const PRIORITY_STYLE: Record<string, PriorityStyle> = {
  critical: {
    border: 'border-[#E5484D]/60',
    text: 'text-[#E5484D]',
    bg: 'bg-[#E5484D]/10',
    hex: '#E5484D',
  },
  high: {
    border: 'border-[#EC7A3C]/60',
    text: 'text-[#EC7A3C]',
    bg: 'bg-[#EC7A3C]/10',
    hex: '#EC7A3C',
  },
  medium: {
    border: 'border-[#94A3B8]/50',
    text: 'text-[#94A3B8]',
    bg: 'bg-[#94A3B8]/10',
    hex: '#94A3B8',
  },
  low: {
    border: 'border-[#64748B]/50',
    text: 'text-[#64748B]',
    bg: 'bg-[#64748B]/10',
    hex: '#64748B',
  },
};

/**
 * `<select>` option lists for the work-item edit / create forms. Centralized
 * so the Type/Priority/Status dropdowns can't drift across the three forms
 * (simplify-audit DD-F3 / §1.4). Each entry is `{ value, label }`.
 *
 * Type DIVERGES on purpose and keeps two sets:
 *   - EDIT forms offer `epic` and label story "Story".
 *   - the CREATE modal omits `epic` (epics are created via a dedicated menu
 *     item) and labels story "User Story".
 * Do NOT unify these — the value list and the user-visible label genuinely
 * differ. Priority and Status are identical everywhere they appear.
 */
export const TYPE_OPTIONS_EDIT = [
  { value: 'user_story', label: 'Story' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'epic', label: 'Epic' },
] as const;

export const TYPE_OPTIONS_CREATE = [
  { value: 'user_story', label: 'User Story' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
] as const;

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
  return PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.low!;
}

/**
 * Whether a work-item type carries story points (and seeds hours from them).
 * Only stories and bugs do — tasks use estimated_hours directly, and epics
 * derive their hours from descendants server-side. Single source of truth so
 * the Create modal's default and the create-payload builder can't drift and
 * reintroduce phantom points/hours (audit #23).
 */
export function typeUsesPoints(type: string): boolean {
  return type === 'user_story' || type === 'bug';
}

/**
 * Hours seeded per story point when a point-bearing item is created. The
 * backend seed/demo generator applies the same factor; keep them in step.
 */
export const HOURS_PER_POINT = 4;
