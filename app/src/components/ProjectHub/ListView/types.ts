export interface WorkItem {
  id: string;
  key: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  completed_at?: string | null;
  estimated_hours?: number;
  logged_hours?: number;
  sprint?: string;
  story_points?: number;
  acceptance_criteria?: string;
  parent_id?: number | null;
  epic_id?: number | null;
  parent_key?: string | null;
  epic_key?: string | null;
}

export interface ListViewProps {
  workItems: WorkItem[];
  onTaskClick?: (item: WorkItem) => void;
}

export type SortField = 'title' | 'status' | 'priority' | 'due_date' | 'completed_at' | 'assignee';
export type SortDirection = 'asc' | 'desc';
