import { AlertTriangle } from 'lucide-react';
import { ProjectPulseView } from '@/components/ProjectHub';
import { PulseData } from '@/components/ProjectHub/pulseData';

interface PulseTabProps {
  hubLoading: boolean;
  pulseData: PulseData | null;
  /** Section names the derive endpoint reported as degraded (compute failed,
   *  fallback served). Empty list = fully healthy. */
  degradedSections?: string[];
}

const PulseTab = ({ hubLoading, pulseData, degradedSections = [] }: PulseTabProps) => {
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

  return (
    <div className="space-y-4">
      {degradedSections.length > 0 && (
        <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-2.5 text-xs text-[#FBBF24] flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Some Pulse data is currently unavailable: {degradedSections.join(', ')}. Refresh to
            retry.
          </span>
        </div>
      )}
      <ProjectPulseView pulse={pulseData} />
    </div>
  );
};

export default PulseTab;
