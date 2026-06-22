import type { GoalResponse, MilestoneResponse, SprintResponse } from '@/client';

export interface WorkItem {
  id: string;
  key: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  type?: string;
  start_date?: string;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  story_points?: number;
  assignee?: string;
  assignee_id?: number;
  sprint?: string;
  acceptance_criteria?: string;
  dependencies?: { depends_on_id: number; dependency_type: string }[];
}

export interface TimelineViewProps {
  workItems: WorkItem[];
  milestones?: MilestoneResponse[];
  goals?: GoalResponse[];
  sprints?: SprintResponse[];
  projectStartDate: string;
  projectId: number;
  onTaskClick?: (item: WorkItem) => void;
  onTaskUpdate?: (itemId: string, updates: { start_date?: string; due_date?: string }) => void;
}

export type ZoomLevel = 'day' | 'week' | 'month';

export interface GanttRow {
  id: string;
  label: string;
  start: Date;
  end: Date;
  color: string;
  type: 'task' | 'milestone' | 'goal';
  progress: number;
}
