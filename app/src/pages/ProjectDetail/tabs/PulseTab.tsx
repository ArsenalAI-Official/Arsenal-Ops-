import { ProjectPulseView } from '@/components/ProjectHub';
import { PulseData } from '@/components/ProjectHub/pulseData';

interface PulseTabProps {
  hubLoading: boolean;
  pulseData: PulseData | null;
  isSubsectionRestricted: (tabName: string, subsectionName: string) => boolean;
}

const PulseTab = ({ hubLoading, pulseData, isSubsectionRestricted }: PulseTabProps) => {
  if (hubLoading || !pulseData) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5"
          >
            <div className="h-4 w-40 bg-[rgba(255,255,255,0.07)] rounded mb-4" />
            <div className="h-40 bg-[rgba(255,255,255,0.025)] rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (
    isSubsectionRestricted('pulse', 'pulse') ||
    isSubsectionRestricted('business', 'business review')
  ) {
    return (
      <div className="text-center py-12 text-[#737373]">
        This section is restricted from your view.
      </div>
    );
  }

  return <ProjectPulseView pulse={pulseData} />;
};

export default PulseTab;
