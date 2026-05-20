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

interface Goal {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  due_date?: string;
  completed_at?: string;
}

interface Milestone {
  id: number;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string;
  is_completed: boolean;
}

interface ProjectDeveloperLite {
  id: number;
  name: string;
  email: string;
}

interface TimelineTabProps {
  hubLoading: boolean;
  hubWorkItems: HubWorkItem[];
  milestones: Milestone[];
  goals: Goal[];
  projectStartDate: string;
  projectId: number;
  developers: ProjectDeveloperLite[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTaskUpdate: (itemId: string, updates: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTaskCreate: (taskData: any) => void;
  isSubsectionRestricted: (tabName: string, subsectionName: string) => boolean;
}

const TimelineTab = ({
  hubLoading,
  hubWorkItems,
  milestones,
  goals,
  projectStartDate,
  projectId,
  developers,
  onTaskUpdate,
  onTaskCreate,
  isSubsectionRestricted,
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

  if (isSubsectionRestricted('calendar', 'calendar')) {
    return (
      <div className="text-center py-12 text-[#737373]">
        This section is restricted from your view.
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
        developers={developers}
        onTaskUpdate={onTaskUpdate}
        onTaskCreate={onTaskCreate}
      />
      <CalendarView workItems={hubWorkItems} milestones={milestones} goals={goals} />
    </div>
  );
};

export default TimelineTab;
