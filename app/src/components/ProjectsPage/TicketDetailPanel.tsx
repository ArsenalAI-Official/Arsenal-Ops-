import { WorkItemPanel } from '@/components/WorkItemPanel';
import type { WorkItem } from '@/components/WorkItemPanel';
import type { MyTask } from './types';

interface TicketDetailPanelProps {
  task: MyTask;
  token: string | null;
  currentUserId: number | null;
  onClose: () => void;
  onTaskChanged: (updated: MyTask) => void;
  onOpenInProjectBoard: (projectId: number, taskId: string) => void;
}

// Thin adapter: maps MyTask → WorkItem shape for the shared WorkItemPanel.
// MyTask is structurally compatible; fields are a superset of WorkItem's
// required surface, so the cast is safe at runtime.
const taskToWorkItem = (task: MyTask): WorkItem => task as unknown as WorkItem;

const TicketDetailPanel = ({
  task,
  token,
  currentUserId,
  onClose,
  onTaskChanged,
  onOpenInProjectBoard,
}: TicketDetailPanelProps) => (
  <WorkItemPanel
    variant="compact"
    item={taskToWorkItem(task)}
    token={token ?? ''}
    currentUserId={currentUserId}
    onClose={onClose}
    onItemChanged={(updated) => onTaskChanged(updated as unknown as MyTask)}
    onOpenInBoard={onOpenInProjectBoard}
  />
);

export default TicketDetailPanel;
