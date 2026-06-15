import type { MyTask, PersonalTask } from '../types';

export const priorityColor = (priority: string): string => {
  if (priority === 'critical') return '#EF4444';
  if (priority === 'high') return '#F97316';
  if (priority === 'medium') return '#F59E0B';
  return '#737373';
};

export const sortPersonalTasks = (a: PersonalTask, b: PersonalTask) => {
  if (a.status === 'done' && b.status !== 'done') return 1;
  if (a.status !== 'done' && b.status === 'done') return -1;
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const aPriority = priorityOrder[a.priority?.toLowerCase() || 'medium'] ?? 999;
  const bPriority = priorityOrder[b.priority?.toLowerCase() || 'medium'] ?? 999;
  return aPriority - bPriority;
};

export const sortUpcomingTasks = (tasks: MyTask[]) => {
  return [...tasks].sort((a, b) => {
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });
};

/**
 * Completed tab: latest-completed first. Falls back to 0 when
 * `completed_at` is missing (legacy rows that pre-date the column), which
 * sorts them at the bottom — better than letting them disrupt the
 * timeline of newer rows.
 */
export const sortCompletedTasks = (tasks: MyTask[]) => {
  return [...tasks].sort((a, b) => {
    const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bT - aT;
  });
};

export type MyTaskTab = 'upcoming' | 'overdue' | 'completed' | 'personal';
