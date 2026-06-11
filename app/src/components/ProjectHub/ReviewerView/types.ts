export interface WorkItem {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
}

export interface Comment {
  id: number;
  content: string;
  author_name: string;
  created_at: string;
}

export interface ReviewerViewProps {
  workItems: WorkItem[];
  projectId: string;
  token: string;
  onTaskUpdate?: (itemId: string, updates: any) => void;
}
