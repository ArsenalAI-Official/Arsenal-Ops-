import { useSearchParams } from 'react-router-dom';
import type { GoalResponse, MilestoneResponse, WorkItemUpdate } from '@/client';
import { TimelineView, CalendarView } from '@/components/ProjectHub';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  // Persist the sub-view in the URL (?view=calendar) so it survives refresh and
  // is shareable, matching the parent's ?tab= pattern. Default (and absent) is
  // the Gantt timeline. Building from `prev` preserves the ?tab= param.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'timeline' | 'calendar' =
    searchParams.get('view') === 'calendar' ? 'calendar' : 'timeline';
  const setView = (next: 'timeline' | 'calendar') => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'calendar') p.set('view', 'calendar');
        else p.delete('view');
        return p;
      },
      { replace: true },
    );
  };

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
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={(v) => {
          // Radix emits '' when the active item is re-clicked; ignore it so a
          // view is always selected.
          if (v) setView(v as 'timeline' | 'calendar');
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="timeline">Timeline</ToggleGroupItem>
        <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
      </ToggleGroup>
      {view === 'timeline' ? (
        <TimelineView
          workItems={hubWorkItems}
          milestones={milestones}
          goals={goals}
          projectStartDate={projectStartDate}
          projectId={projectId}
          onTaskUpdate={onTaskUpdate}
        />
      ) : (
        <CalendarView workItems={hubWorkItems} milestones={milestones} goals={goals} />
      )}
    </div>
  );
};

export default TimelineTab;
