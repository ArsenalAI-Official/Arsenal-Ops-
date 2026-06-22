import PMView from '@/components/PMView';
import type { SprintResponse } from '@/client';

interface ProjectManagerTabProps {
  hubLoading: boolean;
  projectId: string;
  sprints: SprintResponse[];
}

const ProjectManagerTab = ({ hubLoading, projectId, sprints }: ProjectManagerTabProps) => {
  if (hubLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* PMView (with 4 cards) skeleton */}
        <div className="space-y-4">
          {/* Four stat cards skeleton */}
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4"
              >
                <div className="h-2.5 w-20 bg-[rgba(255,255,255,0.05)] rounded mb-3" />
                <div className="h-7 w-16 bg-[rgba(255,255,255,0.06)] rounded mb-2" />
                <div className="h-2.5 w-28 bg-[rgba(255,255,255,0.04)] rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Sprint Progress skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)]" />
            <div className="space-y-1.5">
              <div className="h-4 w-48 bg-[rgba(255,255,255,0.07)] rounded" />
              <div className="h-3 w-64 bg-[rgba(255,255,255,0.04)] rounded" />
            </div>
          </div>
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-3 space-y-3"
            >
              <div className="h-4 w-36 bg-[rgba(255,255,255,0.07)] rounded" />
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-14 bg-[rgba(255,255,255,0.04)] rounded" />
                <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full" />
                <div className="h-3 w-8 bg-[rgba(255,255,255,0.04)] rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-14 bg-[rgba(255,255,255,0.04)] rounded" />
                <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full" />
                <div className="h-3 w-8 bg-[rgba(255,255,255,0.04)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PMView projectId={projectId} token={localStorage.getItem('token')!} sprints={sprints} />
    </div>
  );
};

export default ProjectManagerTab;
