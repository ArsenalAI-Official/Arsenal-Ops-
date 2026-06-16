import { ActivityFeed } from '@/components/ProjectHub';
import type { ActivityResponse } from '@/client';

interface ActivityTabProps {
  hubLoading: boolean;
  activities: ActivityResponse[];
}

const ActivityTab = ({ hubLoading, activities }: ActivityTabProps) => {
  if (hubLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 py-3 border-b border-[rgba(255,255,255,0.04)]"
          >
            <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-3/4 bg-[rgba(255,255,255,0.06)] rounded" />
              <div className="h-2.5 w-24 bg-[rgba(255,255,255,0.04)] rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <ActivityFeed activities={activities} />;
};

export default ActivityTab;
