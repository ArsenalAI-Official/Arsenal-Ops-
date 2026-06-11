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

export interface Milestone {
  id: number;
  title: string;
  due_date?: string;
  completed_at?: string;
}

export interface Goal {
  id: number;
  title: string;
  due_date?: string;
  status: string;
  progress?: number;
}

export interface SprintBand {
  id: number;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
}

export interface TimelineViewProps {
  workItems: WorkItem[];
  milestones?: Milestone[];
  goals?: Goal[];
  sprints?: SprintBand[];
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
