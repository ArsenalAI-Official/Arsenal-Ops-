import type { GoalResponse, MilestoneResponse, WorkItemUpdate } from '@/client';
import { TimelineView, CalendarView } from '@/components/ProjectHub';

interface HubWorkItem {
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
  start_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
  sprint?: string;
  story_points?: number;
}

interface TimelineTabProps {
  hubLoading: boolean;
  hubWorkItems: HubWorkItem[];
  milestones: MilestoneResponse[];
  goals: GoalResponse[];
  projectStartDate: string;
  projectId: number;
  onTaskUpdate: (itemId: string, updates: WorkItemUpdate) => void;
}

const TimelineTab = ({
  hubLoading,
  hubWorkItems,
  milestones,
  goals,
  projectStartDate,
  projectId,
  onTaskUpdate,
}: TimelineTabProps) => {
  if (hubLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* Calendar skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-8 bg-[rgba(255,255,255,0.05)] rounded" />
            ))}
          </div>
          {[...Array(5)].map((_, r) => (
            <div key={r} className="grid grid-cols-7 gap-2 mb-2">
              {[...Array(7)].map((_, c) => (
                <div key={c} className="h-16 bg-[rgba(255,255,255,0.03)] rounded" />
              ))}
            </div>
          ))}
        </div>
        {/* Timeline skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
          <div className="h-96 bg-[rgba(255,255,255,0.025)] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TimelineView
        workItems={hubWorkItems}
        milestones={milestones}
        goals={goals}
        projectStartDate={projectStartDate}
        projectId={projectId}
        onTaskUpdate={onTaskUpdate}
      />
      <CalendarView workItems={hubWorkItems} milestones={milestones} goals={goals} />
    </div>
  );
};

export default TimelineTab;
